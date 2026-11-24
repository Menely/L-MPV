// Adapted from Demetter/ModernGlass modernz.lua (LGPL-2.1).
// Source: https://github.com/Demetter/ModernGlass
// See ModernGlass-LICENSE.txt.

// ModernZ glass for vo=gpu-next: frosts and refracts the video behind glass
// surfaces, adds the light catching their rim and the shadow they cast.
// Loaded by L-MPV and updated through glsl-shader-opts.
// Up to sixteen rounded rectangles, in fractions of the video area.

//!PARAM lg_capture
//!TYPE DYNAMIC float
0.0

//!PARAM lg_blur
//!TYPE DYNAMIC float
0.8

//!PARAM mzg_on
//!TYPE DYNAMIC int
//!MINIMUM 0
//!MAXIMUM 1
0

//!PARAM mzg_strength
//!TYPE DYNAMIC float
//!MINIMUM 0.0
//!MAXIMUM 1.0
1.0

//!PARAM mzg_unit
//!TYPE DYNAMIC float
//!MINIMUM 0.0
//!MAXIMUM 1.0
0.0014

//!PARAM mzg_lens
//!TYPE DYNAMIC float
//!MINIMUM 0.0
//!MAXIMUM 1.0
1.0

//!PARAM mzg_shadow
//!TYPE DYNAMIC float
//!MINIMUM 0.0
//!MAXIMUM 1.0
1.0

//!PARAM mzg_tone
//!TYPE DYNAMIC float
//!MINIMUM 0.0
//!MAXIMUM 1.0
1.0

//!PARAM mzg_0x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_0y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_0w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_0h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_0r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_0a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_0f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_1x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_1y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_1w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_1h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_1r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_1a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_1f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_2x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_2y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_2w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_2h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_2r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_2a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_2f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_3x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_3y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_3w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_3h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_3r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_3a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_3f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_4x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_4y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_4w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_4h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_4r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_4a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_4f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_5x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_5y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_5w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_5h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_5r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_5a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_5f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_6x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_6y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_6w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_6h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_6r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_6a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_6f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_7x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_7y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_7w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_7h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_7r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_7a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_7f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_8x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_8y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_8w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_8h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_8r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_8a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_8f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_9x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_9y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_9w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_9h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_9r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_9a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_9f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_10x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_10y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_10w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_10h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_10r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_10a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_10f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_11x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_11y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_11w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_11h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_11r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_11a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_11f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_12x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_12y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_12w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_12h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_12r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_12a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_12f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_13x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_13y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_13w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_13h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_13r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_13a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_13f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_14x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_14y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_14w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_14h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_14r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_14a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_14f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_15x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_15y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_15w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_15h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_15r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_15a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_15f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_16x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_16y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_16w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_16h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_16r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_16a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_16f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_17x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_17y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_17w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_17h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_17r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_17a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_17f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_18x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_18y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_18w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_18h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_18r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_18a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_18f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_19x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_19y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_19w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_19h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_19r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_19a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_19f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_20x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_20y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_20w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_20h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_20r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_20a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_20f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_21x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_21y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_21w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_21h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_21r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_21a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_21f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_22x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_22y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_22w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_22h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_22r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_22a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_22f
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_23x
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_23y
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_23w
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_23h
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_23r
//!TYPE DYNAMIC float
0.0
//!PARAM mzg_23a
//!TYPE DYNAMIC float
1.0
//!PARAM mzg_23f
//!TYPE DYNAMIC float
0.0

//!HOOK OUTPUT
//!BIND HOOKED
//!SAVE MZG_A
//!WIDTH HOOKED.w 270 * HOOKED.h /
//!HEIGHT 270
//!WHEN mzg_on 0.5 lg_capture > *
//!DESC [ModernZ] glass: downscale
// a fixed 270 rows, so the frost looks the same at any window size
vec4 hook() {
    // box filter over the source texels under this one, two by two with bilinear taps
    int n = clamp(int(ceil(HOOKED_size.y / 540.0)), 1, 8);
    vec4 sum = vec4(0.0);
    for (int y = 0; y < n; y++) {
        for (int x = 0; x < n; x++) {
            vec2 o = (vec2(float(x), float(y)) - 0.5 * float(n - 1)) * 2.0;
            sum += HOOKED_tex(HOOKED_pos + o * HOOKED_pt);
        }
    }
    return sum / float(n * n);
}

//!HOOK OUTPUT
//!BIND MZG_A
//!SAVE MZG_B
//!WIDTH MZG_A.w
//!HEIGHT MZG_A.h
//!WHEN mzg_on 0.5 lg_capture > *
//!DESC [ModernZ] glass: horizontal blur
vec4 hook() {
    // Variable-radius 11-tap separable Gaussian: scales true optical sigma with lg_blur
    // so changing blur percentage alters actual blur spread without ghosting or double-vision
    const float w[6] = float[](0.13304, 0.23238, 0.13539, 0.05118, 0.01254, 0.00199);
    const float o[6] = float[](0.0, 1.4584, 3.4040, 5.3518, 7.3029, 9.2582);
    float blur_scale = mix(0.08, 2.25, clamp(lg_blur, 0.0, 1.0));
    float step_x = MZG_A_pt.x * blur_scale;
    vec4 c = MZG_A_tex(MZG_A_pos) * w[0];
    for (int i = 1; i < 6; i++) {
        vec2 d = vec2(o[i] * step_x, 0.0);
        c += (MZG_A_tex(MZG_A_pos + d) + MZG_A_tex(MZG_A_pos - d)) * w[i];
    }
    return c;
}

//!HOOK OUTPUT
//!BIND MZG_B
//!SAVE MZG_C
//!WIDTH MZG_B.w
//!HEIGHT MZG_B.h
//!WHEN mzg_on 0.5 lg_capture > *
//!DESC [ModernZ] glass: vertical blur
vec4 hook() {
    const float w[6] = float[](0.13304, 0.23238, 0.13539, 0.05118, 0.01254, 0.00199);
    const float o[6] = float[](0.0, 1.4584, 3.4040, 5.3518, 7.3029, 9.2582);
    float blur_scale = mix(0.08, 2.25, clamp(lg_blur, 0.0, 1.0));
    float step_y = MZG_B_pt.y * blur_scale;
    vec4 c = MZG_B_tex(MZG_B_pos) * w[0];
    for (int i = 1; i < 6; i++) {
        vec2 d = vec2(0.0, o[i] * step_y);
        c += (MZG_B_tex(MZG_B_pos + d) + MZG_B_tex(MZG_B_pos - d)) * w[i];
    }
    return c;
}

//!HOOK OUTPUT
//!BIND HOOKED
//!BIND MZG_A
//!BIND MZG_C
//!WHEN mzg_on 0.5 lg_capture > *
//!DESC [ModernZ] glass: composite

// Single-pass analytical SDF and smooth corner-aware 2D outward bevel normal for a rounded box.
// Eliminates 4x finite-difference SDF passes and removes C0 medial-axis diagonal creases inside narrow pills.
float mzg_box_n(vec2 p, float x, float y, float w, float h, float r, out float mh, out vec2 bn) {
    vec2 half_size = 0.5 * vec2(w, h) * HOOKED_size;
    mh = min(half_size.x, half_size.y);
    float rad = min(r * HOOKED_size.y, mh);
    vec2 rel = p - (vec2(x, y) * HOOKED_size + half_size);
    vec2 inner = max(half_size - rad, vec2(0.0));
    vec2 q = abs(rel) - inner;
    vec2 w_out = max(q, 0.0);
    float out_len = length(w_out);
    float qm = max(q.x, q.y);
    float d = out_len + min(qm, 0.0) - rad;

    vec2 s = vec2(rel.x >= 0.0 ? 1.0 : -1.0, rel.y >= 0.0 ? 1.0 : -1.0);
    float soft_k = max(2.5, 0.20 * mh);
    vec2 soft_axis = exp(min(q - qm, 0.0) / soft_k);
    vec2 dir = out_len > 1e-4 ? w_out : soft_axis;
    bn = normalize(s * dir + vec2(0.0, -1e-6));
    return d;
}

// Fast distance-only query for soft ambient drop shadow outside the glass
float mzg_box_d(vec2 p, float x, float y, float w, float h, float r, out float mh) {
    vec2 half_size = 0.5 * vec2(w, h) * HOOKED_size;
    mh = min(half_size.x, half_size.y);
    float rad = min(r * HOOKED_size.y, mh);
    vec2 q = abs(p - (vec2(x, y) * HOOKED_size + half_size)) - half_size + rad;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

#define MZG_SLOT_N(idx) \
    if (mzg_##idx##w > 0.0) { \
        k = mzg_box_n(p, mzg_##idx##x, mzg_##idx##y, mzg_##idx##w, mzg_##idx##h, mzg_##idx##r, kmh, kn); \
        if (k < d) { d = k; a = mzg_##idx##a; f = mzg_##idx##f; mh = kmh; n = kn; } \
    }

#define MZG_SLOT_D(idx) \
    if (mzg_##idx##w > 0.0) { \
        k = mzg_box_d(p, mzg_##idx##x, mzg_##idx##y, mzg_##idx##w, mzg_##idx##h, mzg_##idx##r, kmh); \
        if (k < d) { d = k; a = mzg_##idx##a; } \
    }

float mzg_sdf_full(vec2 p, out float a, out float f, out float mh, out vec2 n) {
    float d = 1e6, k, kmh;
    vec2 kn;
    a = 1.0;
    f = 0.0;
    mh = 32.0;
    n = vec2(0.0, -1.0);
    MZG_SLOT_N(0)  MZG_SLOT_N(1)  MZG_SLOT_N(2)  MZG_SLOT_N(3)
    MZG_SLOT_N(4)  MZG_SLOT_N(5)  MZG_SLOT_N(6)  MZG_SLOT_N(7)
    MZG_SLOT_N(8)  MZG_SLOT_N(9)  MZG_SLOT_N(10) MZG_SLOT_N(11)
    MZG_SLOT_N(12) MZG_SLOT_N(13) MZG_SLOT_N(14) MZG_SLOT_N(15)
    MZG_SLOT_N(16) MZG_SLOT_N(17) MZG_SLOT_N(18) MZG_SLOT_N(19)
    MZG_SLOT_N(20) MZG_SLOT_N(21) MZG_SLOT_N(22) MZG_SLOT_N(23)
    return d;
}

float mzg_sdf_shadow(vec2 p, out float a) {
    float d = 1e6, k, kmh;
    a = 1.0;
    MZG_SLOT_D(0)  MZG_SLOT_D(1)  MZG_SLOT_D(2)  MZG_SLOT_D(3)
    MZG_SLOT_D(4)  MZG_SLOT_D(5)  MZG_SLOT_D(6)  MZG_SLOT_D(7)
    MZG_SLOT_D(8)  MZG_SLOT_D(9)  MZG_SLOT_D(10) MZG_SLOT_D(11)
    MZG_SLOT_D(12) MZG_SLOT_D(13) MZG_SLOT_D(14) MZG_SLOT_D(15)
    MZG_SLOT_D(16) MZG_SLOT_D(17) MZG_SLOT_D(18) MZG_SLOT_D(19)
    MZG_SLOT_D(20) MZG_SLOT_D(21) MZG_SLOT_D(22) MZG_SLOT_D(23)
    return d;
}

vec4 hook() {
    const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
    vec4 c = HOOKED_tex(HOOKED_pos);
    vec2 p = HOOKED_pos * HOOKED_size;
    float u = max(mzg_unit * HOOKED_size.y, 0.25); // pixels per layout unit
    float alpha, frost, min_half;
    vec2 n;
    float d = mzg_sdf_full(p, alpha, frost, min_half, n);
    if (d > 34.0 * u)
        return c;

    if (d > 0.0) {
        // soft ambient shadow cast beneath the glass, slightly deeper on bright scenes
        if (mzg_shadow > 0.0) {
            float sa;
            float ds = max(mzg_sdf_shadow(p - vec2(0.0, 7.0 * u), sa), 0.0) / (16.0 * u);
            float under = dot(MZG_C_tex(HOOKED_pos).rgb, luma);
            float k = mzg_shadow * sa * mix(0.05, 0.14, smoothstep(0.15, 0.85, under));
            c.rgb *= 1.0 - k * exp(-0.5 * ds * ds);
        }
        if (d >= 0.5)
            return c;
    }

    // Apple iOS 26 Liquid Glass + Telegram (Android liquid_glass_shader.agsl / iOS GlassBackgroundView):
    // C2-continuous curved superellipse dome profile at the edge, feathering smoothly into the flat center
    // without an inner curvature step, combined with 3D Snell refraction (IOR = 1.52).
    float thickness = min(min_half * 0.68, 22.0 * u);
    float rim_lin = clamp(1.0 + d / max(thickness, 1.0), 0.0, 1.0);
    float n_cos = rim_lin * rim_lin * (2.25 - 1.25 * rim_lin);
    float n_cos2 = n_cos * n_cos;
    float n_sin = sqrt(max(1.0 - n_cos2, 0.015));
    vec3 normal = normalize(vec3(n * n_cos, n_sin));

    vec3 refract_vec = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / 1.52);
    float h = d < -thickness ? thickness : sqrt(max(d * (-2.0 * thickness - d), 0.0));
    float refract_length = (h + 8.5 * thickness) / max(-refract_vec.z, 0.15);
    vec2 disp_vec = refract_vec.xy * refract_length * (0.54 * mzg_lens);

    vec2 q = clamp((p + disp_vec) / HOOKED_size, vec2(0.0), vec2(1.0));

    // Vector chromatic dispersion along the refracted ray on the outer bevel
    vec2 chroma_vec = disp_vec * (0.095 * n_cos);
    vec2 qR = clamp((p + disp_vec + chroma_vec) / HOOKED_size, vec2(0.0), vec2(1.0));
    vec2 qB = clamp((p + disp_vec - chroma_vec) / HOOKED_size, vec2(0.0), vec2(1.0));

    float user_blur = clamp(lg_blur, 0.0, 1.0);

    // Anisotropic radial rim smear + multi-scale Vogel frosting over MZG_C:
    // At the curved bevel (n_cos > 0), rays integrate across an arc along the normal n,
    // creating Apple Liquid Glass's signature stretched rim distortion while obeying user_blur 100%.
    vec2 rim_streak = n * (n_cos * 2.2) * MZG_C_pt;
    vec3 blur_center = vec3(MZG_C_tex(qR).r, MZG_C_tex(q).g, MZG_C_tex(qB).b);
    vec3 blur_in  = vec3(MZG_C_tex(qR - rim_streak).r, MZG_C_tex(q - rim_streak).g, MZG_C_tex(qB - rim_streak).b);
    vec3 blur_out = vec3(MZG_C_tex(qR + rim_streak).r, MZG_C_tex(q + rim_streak).g, MZG_C_tex(qB + rim_streak).b);
    vec3 blur_g = blur_center * 0.50 + (blur_in + blur_out) * 0.25;

    // Compact 4-tap golden-angle disk within the Gaussian support for dense popover frosting (no hollow ring halos)
    float extra_soft = clamp(frost * 0.55 + user_blur * 0.35, 0.0, 0.85) * step(0.05, user_blur);
    if (extra_soft > 0.01) {
        vec2 r1 = vec2(1.65, 0.85) * MZG_C_pt;
        vec2 r2 = vec2(-0.85, 1.65) * MZG_C_pt;
        vec3 disk = (MZG_C_tex(q + r1).rgb + MZG_C_tex(q - r1).rgb
                   + MZG_C_tex(q + r2).rgb + MZG_C_tex(q - r2).rgb) * 0.25;
        blur_g = mix(blur_g, disk, extra_soft);
    }

    // Crystal-clear 5-tap pre-filtered lens pass (used when user lowers lg_blur toward 0%)
    vec2 a_pt = 1.15 * MZG_A_pt;
    vec3 lens_g = vec3(
        MZG_A_tex(qR).r * 0.40 + (MZG_A_tex(qR + vec2(a_pt.x, 0.0)).r + MZG_A_tex(qR - vec2(a_pt.x, 0.0)).r + MZG_A_tex(qR + vec2(0.0, a_pt.y)).r + MZG_A_tex(qR - vec2(0.0, a_pt.y)).r) * 0.15,
        MZG_A_tex(q).g  * 0.40 + (MZG_A_tex(q  + vec2(a_pt.x, 0.0)).g + MZG_A_tex(q  - vec2(a_pt.x, 0.0)).g + MZG_A_tex(q  + vec2(0.0, a_pt.y)).g + MZG_A_tex(q  - vec2(0.0, a_pt.y)).g) * 0.15,
        MZG_A_tex(qB).b * 0.40 + (MZG_A_tex(qB + vec2(a_pt.x, 0.0)).b + MZG_A_tex(qB - vec2(a_pt.x, 0.0)).b + MZG_A_tex(qB + vec2(0.0, a_pt.y)).b + MZG_A_tex(qB - vec2(0.0, a_pt.y)).b) * 0.15
    );
    vec3 raw_clear = vec3(HOOKED_tex(qR).r, HOOKED_tex(q).g, HOOKED_tex(qB).b);
    vec3 clear_pass = mix(raw_clear, lens_g, smoothstep(0.0, 0.20, user_blur));

    // Apple Liquid Glass / Telegram lens preservation:
    // The curved bevel (n_cos > 0) preserves high-frequency optical refraction of the background,
    // ensuring crisp 3D lens curvature and chromatic dispersion remain vivid even at 80-100% blur setting,
    // while the interior center remains 100% frosted and legible.
    float bevel_blur = user_blur * (1.0 - 0.72 * n_cos);
    vec3 g = mix(clear_pass, blur_g, smoothstep(0.0, 0.35, bevel_blur));

    // Vibrancy: keep refracted colors luminous like optical crystal
    float l = dot(g, luma);
    g = clamp(mix(vec3(l), g, 1.38), 0.0, 1.0);

    // Adaptive legibility for pure white icons and text over bright video scenes
    vec2 o = 9.0 * MZG_C_pt;
    float under = dot(MZG_C_tex(q).rgb + MZG_C_tex(q + vec2(o.x, 0.0)).rgb + MZG_C_tex(q - vec2(o.x, 0.0)).rgb
                      + MZG_C_tex(q + vec2(0.0, o.y)).rgb + MZG_C_tex(q - vec2(0.0, o.y)).rgb, luma) / 5.0;
    g = g * (1.0 - mzg_tone * 0.44 * smoothstep(0.30, 1.0, under)) + mzg_tone * 0.03 * (1.0 - under);

    // Inner depth volume along the curved bevel
    g *= 1.0 - mzg_lens * 0.09 * n_cos2;

    // Resolution-independent dual-lobe Fresnel specular rim + subtle inner caustic sheen (Apple / Telegram style)
    float light_dir = dot(n, normalize(vec2(-0.58, -0.81)));
    float fp = max(light_dir, 0.0);
    float fn = max(-light_dir, 0.0);
    float lit = 0.14 + 0.86 * (fp * fp) + 0.46 * (fn * fn);
    float d_u = d / max(u, 0.5);
    float rim_line = exp(-2.8 * (d_u + 0.55) * (d_u + 0.55));
    float bright_guard = mix(1.0, 0.64, smoothstep(0.45, 0.95, under));
    g += mzg_lens * lit * bright_guard * (0.24 * rim_line + 0.055 * (n_cos2 * n_cos));

    float m = clamp(0.5 - d, 0.0, 1.0) * mzg_strength * alpha;
    return vec4(mix(c.rgb, g, m), c.a);
}
