// L-MPV NCNN/Vulkan VapourSynth filter.
// Accepts planar RGB float frames and preconverted NCNN .param/.bin models.

#include <VapourSynth4.h>
#include <VSHelper4.h>
#include <gpu.h>
#include <net.h>

#include <algorithm>
#include <cstdint>
#include <memory>
#include <string>

struct FilterData {
    VSNode *node{};
    VSVideoInfo vi{};
    ncnn::Net net;
    int input_index{};
    int output_index{};
    int scale{2};
    int tile_size{256};
    int overlap{16};
};

static void set_filter_error(VSFrameContext *ctx, const VSAPI *vsapi, const std::string &message) {
    vsapi->setFilterError(("L-MPV NCNN: " + message).c_str(), ctx);
}

static const VSFrame *VS_CC get_frame(int n, int activation_reason, void *instance_data,
                                      void **, VSFrameContext *frame_ctx, VSCore *core,
                                      const VSAPI *vsapi) {
    auto *d = static_cast<FilterData *>(instance_data);
    if (activation_reason == arInitial) {
        vsapi->requestFrameFilter(n, d->node, frame_ctx);
        return nullptr;
    }
    if (activation_reason != arAllFramesReady)
        return nullptr;

    const VSFrame *src = vsapi->getFrameFilter(n, d->node, frame_ctx);
    const int src_w = vsapi->getFrameWidth(src, 0);
    const int src_h = vsapi->getFrameHeight(src, 0);
    const int dst_w = src_w * d->scale;
    const int dst_h = src_h * d->scale;
    VSFrame *dst = vsapi->newVideoFrame(&d->vi.format, dst_w, dst_h, src, core);

    const int tile = std::max(32, d->tile_size);
    const int overlap = std::clamp(d->overlap, 0, tile / 3);
    const int step = std::max(1, tile - overlap * 2);

    for (int top = 0;; top = std::min(top + step, std::max(0, src_h - tile))) {
        const int tile_h = std::min(tile, src_h - top);
        for (int left = 0;; left = std::min(left + step, std::max(0, src_w - tile))) {
            const int tile_w = std::min(tile, src_w - left);
            ncnn::Mat input(tile_w, tile_h, 3, sizeof(float), 1);
            for (int plane = 0; plane < 3; ++plane) {
                const auto *source = reinterpret_cast<const float *>(vsapi->getReadPtr(src, plane));
                const ptrdiff_t stride = vsapi->getStride(src, plane) / sizeof(float);
                float *target = input.channel(plane);
                for (int y = 0; y < tile_h; ++y)
                    std::copy_n(source + (top + y) * stride + left, tile_w, target + y * tile_w);
            }

            ncnn::Extractor extractor = d->net.create_extractor();
            if (extractor.input(d->input_index, input) != 0) {
                vsapi->freeFrame(src);
                vsapi->freeFrame(dst);
                set_filter_error(frame_ctx, vsapi, "failed to upload an input tile");
                return nullptr;
            }
            ncnn::Mat output;
            if (extractor.extract(d->output_index, output) != 0 || output.empty()) {
                vsapi->freeFrame(src);
                vsapi->freeFrame(dst);
                set_filter_error(frame_ctx, vsapi, "Vulkan inference failed");
                return nullptr;
            }
            if (output.w != tile_w * d->scale || output.h != tile_h * d->scale || output.c < 3) {
                vsapi->freeFrame(src);
                vsapi->freeFrame(dst);
                set_filter_error(frame_ctx, vsapi, "model output shape does not match the selected 2x scale");
                return nullptr;
            }

            const int crop_l = left == 0 ? 0 : overlap * d->scale;
            const int crop_t = top == 0 ? 0 : overlap * d->scale;
            const int crop_r = left + tile_w == src_w ? 0 : overlap * d->scale;
            const int crop_b = top + tile_h == src_h ? 0 : overlap * d->scale;
            for (int plane = 0; plane < 3; ++plane) {
                auto *target = reinterpret_cast<float *>(vsapi->getWritePtr(dst, plane));
                const ptrdiff_t stride = vsapi->getStride(dst, plane) / sizeof(float);
                const float *source = output.channel(plane);
                for (int y = crop_t; y < output.h - crop_b; ++y) {
                    std::copy_n(source + y * output.w + crop_l, output.w - crop_l - crop_r,
                                target + (top * d->scale + y) * stride + left * d->scale + crop_l);
                }
            }

            if (left + tile_w == src_w)
                break;
        }
        if (top + tile_h == src_h)
            break;
    }

    vsapi->freeFrame(src);
    return dst;
}

static void VS_CC free_filter(void *instance_data, VSCore *, const VSAPI *vsapi) {
    auto *d = static_cast<FilterData *>(instance_data);
    vsapi->freeNode(d->node);
    delete d;
}

static void VS_CC create_filter(const VSMap *in, VSMap *out, void *, VSCore *core,
                                const VSAPI *vsapi) {
    auto d = std::make_unique<FilterData>();
    d->node = vsapi->mapGetNode(in, "clip", 0, nullptr);
    const VSVideoInfo *input_vi = vsapi->getVideoInfo(d->node);
    if (!vsh::isConstantVideoFormat(input_vi) || input_vi->format.colorFamily != cfRGB ||
        input_vi->format.sampleType != stFloat || input_vi->format.bitsPerSample != 32) {
        vsapi->mapSetError(out, "L-MPV NCNN: input must be constant RGBS");
        vsapi->freeNode(d->node);
        return;
    }

    int error = 0;
    const char *param_path = vsapi->mapGetData(in, "param_path", 0, &error);
    const char *model_path = vsapi->mapGetData(in, "model_path", 0, &error);
    d->scale = static_cast<int>(vsapi->mapGetInt(in, "scale", 0, &error));
    if (error) d->scale = 2;
    d->tile_size = static_cast<int>(vsapi->mapGetInt(in, "tile_size", 0, &error));
    if (error) d->tile_size = 256;
    d->overlap = static_cast<int>(vsapi->mapGetInt(in, "overlap", 0, &error));
    if (error) d->overlap = 16;
    const bool fp16 = !!vsapi->mapGetInt(in, "fp16", 0, &error);
    int device_error = 0;
    const int requested_device = static_cast<int>(vsapi->mapGetInt(in, "device_id", 0, &device_error));

    ncnn::create_gpu_instance();
    const int device_id = device_error ? ncnn::get_default_gpu_index() : requested_device;
    ncnn::VulkanDevice *device = ncnn::get_gpu_device(device_id);
    if (!device) {
        vsapi->mapSetError(out, "L-MPV NCNN: no Vulkan compute device found");
        vsapi->freeNode(d->node);
        return;
    }
    d->net.opt.use_vulkan_compute = true;
    d->net.opt.use_fp16_packed = fp16;
    d->net.opt.use_fp16_storage = fp16;
    d->net.set_vulkan_device(device);
    if (d->net.load_param(param_path) != 0 || d->net.load_model(model_path) != 0 ||
        d->net.input_indexes().empty() || d->net.output_indexes().empty()) {
        vsapi->mapSetError(out, "L-MPV NCNN: failed to load .param/.bin model pair");
        vsapi->freeNode(d->node);
        return;
    }
    d->input_index = d->net.input_indexes().front();
    d->output_index = d->net.output_indexes().front();
    d->vi = *input_vi;
    d->vi.width *= d->scale;
    d->vi.height *= d->scale;

    FilterData *data = d.release();
    VSFilterDependency dependency[] = {{data->node, rpStrictSpatial}};
    vsapi->createVideoFilter(out, "LmpvNcnn", &data->vi, get_frame, free_filter,
                             fmParallelRequests, dependency, 1, data, core);
}

VS_EXTERNAL_API(void) VapourSynthPluginInit2(VSPlugin *plugin, const VSPLUGINAPI *vspapi) {
    vspapi->configPlugin("io.github.menely.lmpv.ncnn", "lmpvncnn",
                         "L-MPV NCNN Vulkan Upscaler", VS_MAKE_VERSION(1, 0),
                         VAPOURSYNTH_API_VERSION, 0, plugin);
    vspapi->registerFunction(
        "Model",
        "clip:vnode;param_path:data;model_path:data;scale:int:opt;tile_size:int:opt;overlap:int:opt;fp16:int:opt;device_id:int:opt;",
        "clip:vnode;", create_filter, nullptr, plugin);
}
