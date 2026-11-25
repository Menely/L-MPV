// Adapted from Demetter/ModernGlass modernz.lua (LGPL-2.1).
// Source: https://github.com/Demetter/ModernGlass
// See ModernGlass-LICENSE.txt.

// ModernZ glass for vo=gpu-next: frosts and refracts the video behind glass
// surfaces, adds the light catching their rim and the shadow they cast.
// Loaded by L-MPV and updated through glsl-shader-opts.
// Up to twenty-four rounded rectangles, in fractions of the video area.

//!PARAM lg_capture
//!TYPE DYNAMIC float
0.0

//!PARAM lg_blur
//!TYPE DYNAMIC float
0.9

//!PARAM lg_refraction
//!TYPE DYNAMIC float
//!MINIMUM 0.0
//!MAXIMUM 2.5
1.0

//!PARAM lg_disp
//!TYPE DYNAMIC float
//!MINIMUM 0.0
//!MAXIMUM 2.5
1.0

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

//!PARAM mzg_tone
//!TYPE DYNAMIC float
//!MINIMUM 0.0
//!MAXIMUM 1.0
1.0

//!PARAM mzg_top_y
//!TYPE DYNAMIC float
0.0

//!PARAM mzg_top_h
//!TYPE DYNAMIC float
0.0

//!PARAM mzg_top_a
//!TYPE DYNAMIC float
0.0

//!PARAM mzg_tint_r
//!TYPE DYNAMIC float
0.0

//!PARAM mzg_tint_g
//!TYPE DYNAMIC float
0.0

//!PARAM mzg_tint_b
//!TYPE DYNAMIC float
0.0

//!PARAM mzg_tint_a
//!TYPE DYNAMIC float
0.0

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
//!WIDTH HOOKED.w 220 * HOOKED.h /
//!HEIGHT 220
//!WHEN mzg_on 0.5 lg_capture > *
//!DESC [ModernZ] glass: downscale
// Фиксированная высота 220 строк даёт глубокое гладкое размытие без блочной ряби на любых экранах
vec4 hook() {
    // box filter over the source texels under this one with bilinear taps
    int n = clamp(int(ceil(HOOKED_size.y / 540.0)), 2, 4);
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
    // Variable-radius 11-tap separable Gaussian:
    // Шаг ограничен <= 1.32 для сплошного перекрытия без интерференционной гребенки.
    const float w[6] = float[](0.13304, 0.23238, 0.13539, 0.05118, 0.01254, 0.00199);
    const float o[6] = float[](0.0, 1.4584, 3.4040, 5.3518, 7.3029, 9.2582);
    float blur_scale = mix(0.05, 1.32, clamp(lg_blur, 0.0, 1.0));
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
    float blur_scale = mix(0.05, 1.32, clamp(lg_blur, 0.0, 1.0));
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

// Единая геометрия скругления углов в полном соответствии с правилами CSS border-radius L-MPV:
// Внешний контур точно повторяет круговой радиус элементов интерфейса без искажения формы.
float mzg_box_n(vec2 p, float x, float y, float w, float h, float r, out float mh, out float d_bevel, out vec2 bn) {
    vec2 half_size = 0.5 * vec2(w, h) * HOOKED_size;
    vec2 rel = p - (vec2(x, y) * HOOKED_size + half_size);
    vec2 abs_rel = abs(rel);
    if (abs_rel.x >= half_size.x + 3.0 || abs_rel.y >= half_size.y + 3.0) {
        mh = 32.0;
        d_bevel = 1e6;
        bn = vec2(0.0, -1.0);
        return 1e6;
    }
    mh = min(half_size.x, half_size.y);
    float rad = min(r * HOOKED_size.y, mh);
    vec2 inner = max(half_size - rad, vec2(0.0));
    vec2 q = abs_rel - inner;
    vec2 w_out = max(q, 0.0);
    float out_len = length(w_out);
    float qm = max(q.x, q.y);
    float d = out_len + min(qm, 0.0) - rad;
    if (d >= 2.0) {
        d_bevel = 1e6;
        bn = vec2(0.0, -1.0);
        return d;
    }

    // Гладкая внутренняя фаска по R-функции без заломов на углах
    vec2 neg_q = max(-q, 0.0);
    float neg_r = (neg_q.x * neg_q.y) / max(length(neg_q), 1e-4);
    float ridge = mix(min(neg_q.x, neg_q.y), neg_r, 0.85);
    d_bevel = out_len - ridge - rad;

    // Плавное поле нормалей с аналитической softplus-функцией без швов на осях симметрии
    vec2 k_ax = max(vec2(6.0), 0.36 * half_size);
    vec2 s_smooth = rel / sqrt(rel * rel + k_ax * k_ax);
    float k_n = clamp(max(4.5, 0.25 * mh), 4.5, 11.0);
    vec2 soft_q = w_out + k_n * log(1.0 + exp(-abs(q) / k_n));
    vec2 raw_bn = s_smooth * soft_q;
    bn = raw_bn / sqrt(dot(raw_bn, raw_bn) + 0.25);
    return d;
}

#define MZG_SLOT_N(idx) \
    if (mzg_##idx##w > 0.0) { \
        k = mzg_box_n(p, mzg_##idx##x, mzg_##idx##y, mzg_##idx##w, mzg_##idx##h, mzg_##idx##r, kmh, kd_bev, kn); \
        if (mzg_##idx##f < 1.5) { \
            if (k < d) { d = k; d_bevel = kd_bev; a = mzg_##idx##a; f = mzg_##idx##f; mh = kmh; n = kn; } \
        } else { \
            if (k < d_sub) { d_sub = k; d_bev_sub = kd_bev; a_sub = mzg_##idx##a; mh_sub = kmh; n_sub = kn; } \
        } \
    }

void mzg_sdf_full(
    vec2 p,
    out float d, out float d_bevel, out float a, out float f, out float mh, out vec2 n,
    out float d_sub, out float d_bev_sub, out float a_sub, out float mh_sub, out vec2 n_sub
) {
    float k, kmh, kd_bev;
    vec2 kn;
    d = 1e6;
    d_bevel = 1e6;
    a = 1.0;
    f = 0.0;
    mh = 32.0;
    n = vec2(0.0, -1.0);
    d_sub = 1e6;
    d_bev_sub = 1e6;
    a_sub = 1.0;
    mh_sub = 32.0;
    n_sub = vec2(0.0, -1.0);
    MZG_SLOT_N(0)  MZG_SLOT_N(1)  MZG_SLOT_N(2)  MZG_SLOT_N(3)
    MZG_SLOT_N(4)  MZG_SLOT_N(5)  MZG_SLOT_N(6)  MZG_SLOT_N(7)
    MZG_SLOT_N(8)  MZG_SLOT_N(9)  MZG_SLOT_N(10) MZG_SLOT_N(11)
    MZG_SLOT_N(12) MZG_SLOT_N(13) MZG_SLOT_N(14) MZG_SLOT_N(15)
    MZG_SLOT_N(16) MZG_SLOT_N(17) MZG_SLOT_N(18) MZG_SLOT_N(19)
    MZG_SLOT_N(20) MZG_SLOT_N(21) MZG_SLOT_N(22) MZG_SLOT_N(23)
}

// Единый оптический расчёт стеклянной поверхности (для базового слоя и вложенных карточек Капсулы):
// Сочетает выразительное 3D-преломление Снеллиуса на фаске, физическую дисперсию Коши (lg_disp),
// двухкольцевое размытие без ряби, адаптивное осветление тёмных сцен, фильтр Бугера—Ламберта—Бера
// и двунаправленный контурный блик с внутренним свечением фаски.
vec3 mzg_sample_glass(
    vec2 p,
    float d_val,
    float d_bev,
    float frost_val,
    float mh,
    vec2 n,
    float u,
    float user_blur,
    vec3 tint_rgb,
    float tint_a,
    float is_nested
) {
    const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
    float max_thick = mix(28.0, 16.0, is_nested);
    float half_ratio = mix(0.72, 0.58, is_nested);
    float thickness = min(mh * half_ratio, max_thick * u);
    float rim_t = clamp(1.0 + d_bev / max(thickness, 1.0), 0.0, 1.0);
    float bevel_smooth = rim_t * rim_t * (3.0 - 2.0 * rim_t);
    float n_cos = bevel_smooth * (0.88 + 0.12 * rim_t);
    float n_cos2 = n_cos * n_cos;
    float n_sin = sqrt(max(1.0 - n_cos2 * 0.82, 0.06));
    vec3 normal = normalize(vec3(n * n_cos, n_sin));

    // Полноценное 3D-преломление Снеллиуса (IOR = 1.52) с сохранением чёткости на фаске
    vec3 refract_vec = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / 1.52);
    float dome_h = thickness * sqrt(max(1.0 - bevel_smooth * bevel_smooth, 0.0));
    float length_mul = mix(7.5, 6.0, is_nested);
    float refract_length = (dome_h + length_mul * thickness) / max(-refract_vec.z, 0.20);
    float blur_lens_boost = 1.0 + 0.35 * user_blur * bevel_smooth;
    float disp_gain = mix(0.55, 0.52, is_nested);
    float refract_scale = clamp(lg_refraction, 0.0, 2.5);
    float refract_factor = clamp(refract_scale, 0.0, 1.0);
    vec2 disp_vec = refract_vec.xy * refract_length * (disp_gain * mzg_lens * refract_scale * blur_lens_boost);

    vec2 q = clamp((p + disp_vec) / HOOKED_size, vec2(0.0), vec2(1.0));

    // Физическая призматическая дисперсия Коши вдоль преломлённого луча (lg_disp):
    // коротковолновый синий спектр (IOR выше) отклоняется сильнее (+chroma_vec),
    // длинноволновый красный спектр (IOR ниже) отклоняется слабее (-chroma_vec).
    float disp_scale = clamp(lg_disp, 0.0, 2.5);
    float chroma_damp = 1.0 / max(1.0, sqrt(refract_scale));
    vec2 chroma_vec = disp_vec * (mix(0.095, 0.082, is_nested) * bevel_smooth * chroma_damp * disp_scale);
    vec2 qR = clamp((p + disp_vec - chroma_vec) / HOOKED_size, vec2(0.0), vec2(1.0));
    vec2 qB = clamp((p + disp_vec + chroma_vec) / HOOKED_size, vec2(0.0), vec2(1.0));

    // Двухкольцевое сглаженное ядро: на преломляющей фаске шаг кольца сжимается (bevel_atten),
    // чтобы живое преломление оставалось чистым и без волнистой ряби, а внутри сохранялся плотный фрост.
    // При нулевом преломлении размытие равномерно заполняет всю карточку до самой кромки.
    float frost_blend = clamp(frost_val, 0.0, 1.0);
    float raw_bevel_atten = mix(1.0 - 0.88 * bevel_smooth, 1.0 - 0.72 * bevel_smooth, frost_blend);
    float bevel_atten = mix(1.0, raw_bevel_atten, refract_factor);
    float spread = user_blur * (1.28 + 0.95 * frost_blend) * bevel_atten;
    vec2 s1 = vec2(1.0, 0.0) * spread * MZG_C_pt;
    vec2 s2 = vec2(0.0, 1.0) * spread * MZG_C_pt;
    vec2 s3 = vec2(0.7071, 0.7071) * spread * MZG_C_pt;
    vec2 s4 = vec2(-0.7071, 0.7071) * spread * MZG_C_pt;

    vec2 rim_streak = n * (bevel_smooth * 0.90 * user_blur * refract_factor) * MZG_C_pt;
    vec3 blur_center = vec3(MZG_C_tex(qR).r, MZG_C_tex(q).g, MZG_C_tex(qB).b);
    vec3 blur_edge = 0.5 * (
        vec3(MZG_C_tex(qR + rim_streak).r, MZG_C_tex(q + rim_streak).g, MZG_C_tex(qB + rim_streak).b) +
        vec3(MZG_C_tex(qR - rim_streak).r, MZG_C_tex(q - rim_streak).g, MZG_C_tex(qB - rim_streak).b)
    );
    // Внутреннее кольцо размытия сохраняет хроматическое разделение каналов (qR, q, qB),
    // чтобы матовое рассеивание не «съедало» и не обесцвечивало призматическую дисперсию на фаске.
    vec3 inner_ring = (
        vec3(MZG_C_tex(qR + s1 * 0.5).r, MZG_C_tex(q + s1 * 0.5).g, MZG_C_tex(qB + s1 * 0.5).b) +
        vec3(MZG_C_tex(qR - s1 * 0.5).r, MZG_C_tex(q - s1 * 0.5).g, MZG_C_tex(qB - s1 * 0.5).b) +
        vec3(MZG_C_tex(qR + s2 * 0.5).r, MZG_C_tex(q + s2 * 0.5).g, MZG_C_tex(qB + s2 * 0.5).b) +
        vec3(MZG_C_tex(qR - s2 * 0.5).r, MZG_C_tex(q - s2 * 0.5).g, MZG_C_tex(qB - s2 * 0.5).b)
    ) * 0.25;
    vec3 outer_ring = (
        MZG_C_tex(q + s1).rgb + MZG_C_tex(q - s1).rgb +
        MZG_C_tex(q + s2).rgb + MZG_C_tex(q - s2).rgb +
        MZG_C_tex(q + s3).rgb + MZG_C_tex(q - s3).rgb +
        MZG_C_tex(q + s4).rgb + MZG_C_tex(q - s4).rgb
    ) * 0.125;
    vec3 ring_g = mix(inner_ring, outer_ring, 0.58);

    float ring_weight = clamp(user_blur * (0.74 + 0.22 * frost_blend) * bevel_atten, 0.0, 0.92);
    vec3 base_glass = mix(blur_center, blur_edge, 0.38 * bevel_smooth);
    vec3 blur_g = mix(base_glass, ring_g, ring_weight);

    // Хрустальная кромка (edgeClarity): на полированной грани плавно проявляем преломлённый оптический буфер MZG_A,
    // чтобы ярко подчеркнуть линзу и призму без рваных 1px-контуров сырого неразмытого кадра.
    vec3 lens_col = vec3(MZG_A_tex(qR).r, MZG_A_tex(q).g, MZG_A_tex(qB).b);
    float edge_clarity = (bevel_smooth * bevel_smooth) * 0.22 * refract_factor * mix(1.0, 0.65, is_nested);
    vec3 g = mix(blur_g, lens_col, edge_clarity);
    if (user_blur < 0.15) {
        vec3 sharp_col = vec3(HOOKED_tex(qR).r, HOOKED_tex(q).g, HOOKED_tex(qB).b);
        g = mix(sharp_col, g, smoothstep(0.0, 0.15, user_blur));
    }

    float l = dot(g, luma);
    g = clamp(mix(vec3(l), g, 1.36), 0.0, 1.0);

    // Балансировка яркости: сдерживание пересветов на светлых сценах и мягкое ледяное осветление на тёмных (darkBoost)
    float under = dot(blur_g, luma);
    float bright_norm = smoothstep(0.34, 0.96, under);
    float bright_damp = mzg_tone * mix(0.22, 0.30, frost_blend) * bright_norm;
    float dark_boost = mzg_tone * (1.0 - smoothstep(0.08, 0.56, under)) * mix(0.11, 0.045, tint_a) * mix(1.0, 0.70, is_nested);
    g = g * (1.0 - bright_damp);
    g = mix(g, vec3(0.92, 0.96, 1.0), dark_boost);
    if (is_nested > 0.5) {
        g *= mix(0.96, 0.87, bright_norm);
    }

    if (tint_a > 0.005) {
        vec3 tint_filter_target = clamp(tint_rgb * 1.62 + vec3(0.16), 0.0, 1.0);
        float filter_strength = clamp(
            mix(0.56, 0.70, bright_norm) * tint_a * mix(1.0, 1.06, is_nested),
            0.0,
            0.80
        );
        vec3 glass_filter = mix(vec3(1.0), tint_filter_target, filter_strength);
        g *= glass_filter;
        float pigment_base = mix(0.13, 0.095, smoothstep(0.05, 0.75, under)) * mix(1.0, 1.14, is_nested);
        float bevel_protect = 1.0 - 0.50 * bevel_smooth;
        float crystal_scatter = tint_a * pigment_base * bevel_protect;
        g = mix(g, tint_rgb, crystal_scatter);
    } else {
        // Для бесцветного режима (transparent): невесомая дымка (<= 16%) только при высокой яркости фона
        float neutral_smoke = (
            0.10 * bright_norm * (0.40 + 0.60 * frost_blend) +
            0.06 * is_nested * mix(0.25, 1.0, bright_norm)
        ) * (1.0 - 0.50 * bevel_smooth);
        g = mix(g, vec3(0.12, 0.14, 0.17), clamp(neutral_smoke, 0.0, 0.16));
    }

    // Двунаправленный спекулярный блик (верх-лево + отражённое эхо низ-право) и внутреннее свечение фаски (innerGlow)
    float light_dir = dot(n, normalize(vec2(-0.55, -0.83)));
    float fp = max(light_dir, 0.0);
    float fn = max(-light_dir, 0.0);
    float d_u = d_val / max(u, 0.5);
    float rim_line = exp(-2.0 * (d_u + 0.75) * (d_u + 0.75));
    float spec_top = pow(fp, 1.8) * 0.56;
    float spec_bot = pow(fn, 2.2) * 0.28;
    float rim_highlight = rim_line * (0.16 + spec_top + spec_bot);
    float inner_glow = pow(rim_t, 2.2) * 0.085 * (0.50 + 0.50 * abs(light_dir));
    float sheen = 0.055 * clamp(refract_scale, 0.0, 1.4) * (n_cos2 * bevel_smooth);
    float bright_guard = mix(1.0, 0.62, smoothstep(0.45, 0.95, under));
    vec3 rim_tint = tint_a > 0.005
        ? mix(vec3(1.0), clamp(tint_rgb * 1.50 + vec3(0.35), 0.0, 1.0), 0.35 * tint_a)
        : vec3(1.0);
    float layer_gain = mix(1.0, 0.62, is_nested);
    g += mzg_lens * layer_gain * bright_guard * rim_tint * (rim_highlight * 0.58 + inner_glow + sheen);

    return g;
}

vec4 hook() {
    const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
    vec4 c = HOOKED_tex(HOOKED_pos);
    vec2 p = HOOKED_pos * HOOKED_size;
    float u = max(mzg_unit * HOOKED_size.y, 0.25); // pixels per layout unit

    float d, d_bevel, alpha, frost, min_half;
    vec2 n;
    float d_sub, d_bev_sub, a_sub, mh_sub;
    vec2 n_sub;
    mzg_sdf_full(p, d, d_bevel, alpha, frost, min_half, n, d_sub, d_bev_sub, a_sub, mh_sub, n_sub);

    // Истинная евклидова норма экранных производных (строго до условных выходов, для всех 2x2 квадов GPU)
    float aa_base = max(length(vec2(dFdx(d), dFdy(d))), 0.75);
    float aa_sub = max(length(vec2(dFdx(d_sub), dFdy(d_sub))), 0.75);

    float user_blur = clamp(lg_blur, 0.0, 1.0);
    bool in_top = (mzg_top_h > 0.0 && mzg_top_a > 0.005
        && HOOKED_pos.y >= mzg_top_y && HOOKED_pos.y <= mzg_top_y + mzg_top_h);

    if (d >= 0.5 && d_sub >= 0.5 && !in_top)
        return c;

    // Compact frosted strip behind the titlebar ending crisply just below the video title
    vec3 out_rgb = c.rgb;
    if (in_top && user_blur > 0.005) {
        float rt = clamp((HOOKED_pos.y - mzg_top_y) / max(mzg_top_h, 1e-5), 0.0, 1.0);
        float top_band = 1.0 - smoothstep(0.70, 1.0, rt);

        if (top_band > 0.001) {
            vec3 tc_center = MZG_C_tex(HOOKED_pos).rgb;
            vec3 top_g = tc_center;
            float top_spread = user_blur * 1.30;
            if (top_spread > 0.08) {
                vec2 ts1 = vec2(1.0, 0.0) * top_spread * MZG_C_pt;
                vec2 ts2 = vec2(0.0, 1.0) * top_spread * MZG_C_pt;
                vec2 ts3 = vec2(0.7071, 0.7071) * top_spread * MZG_C_pt;
                vec2 ts4 = vec2(-0.7071, 0.7071) * top_spread * MZG_C_pt;
                vec3 tc_ring = (
                    MZG_C_tex(clamp(HOOKED_pos + ts1, vec2(0.0), vec2(1.0))).rgb +
                    MZG_C_tex(clamp(HOOKED_pos - ts1, vec2(0.0), vec2(1.0))).rgb +
                    MZG_C_tex(clamp(HOOKED_pos + ts2, vec2(0.0), vec2(1.0))).rgb +
                    MZG_C_tex(clamp(HOOKED_pos - ts2, vec2(0.0), vec2(1.0))).rgb +
                    MZG_C_tex(clamp(HOOKED_pos + ts3, vec2(0.0), vec2(1.0))).rgb +
                    MZG_C_tex(clamp(HOOKED_pos - ts3, vec2(0.0), vec2(1.0))).rgb +
                    MZG_C_tex(clamp(HOOKED_pos + ts4, vec2(0.0), vec2(1.0))).rgb +
                    MZG_C_tex(clamp(HOOKED_pos - ts4, vec2(0.0), vec2(1.0))).rgb
                ) * 0.125;
                top_g = mix(tc_center, tc_ring, clamp(0.70 * user_blur, 0.0, 0.70));
            }

            float top_under = dot(top_g, luma);
            float top_scrim = mzg_tone * (0.05 + 0.16 * smoothstep(0.35, 0.95, top_under));
            top_g = top_g * (1.0 - top_scrim);
            if (mzg_tint_a > 0.005) {
                vec3 top_tint = vec3(mzg_tint_r, mzg_tint_g, mzg_tint_b);
                vec3 top_filter = mix(vec3(1.0), clamp(top_tint * 1.50 + vec3(0.24), 0.0, 1.0), 0.38 * mzg_tint_a);
                top_g *= top_filter;
                float top_scatter = mzg_tint_a * 0.05 * (1.0 - 0.55 * smoothstep(0.10, 0.65, top_under));
                top_g = mix(top_g, top_tint, top_scatter);
            }

            float edge_alpha = top_band * smoothstep(0.0, 0.10, user_blur) * (mzg_top_a * 0.92);
            out_rgb = mix(out_rgb, top_g, edge_alpha);
        }
    }

    vec3 tint_rgb = vec3(mzg_tint_r, mzg_tint_g, mzg_tint_b);
    float tint_a = clamp(mzg_tint_a, 0.0, 1.0);

    if (d < 0.5) {
        vec3 g_base = mzg_sample_glass(
            p, d, d_bevel, frost, min_half, n, u, user_blur, tint_rgb, tint_a, 0.0
        );
        float m = clamp(0.5 - d / aa_base, 0.0, 1.0) * mzg_strength * alpha;
        out_rgb = mix(out_rgb, g_base, m);
    }

    if (d_sub < 0.5) {
        vec3 g_sub = mzg_sample_glass(
            p, d_sub, d_bev_sub, 1.0, mh_sub, n_sub, u, user_blur, tint_rgb, tint_a, 1.0
        );
        float m_sub = clamp(0.5 - d_sub / aa_sub, 0.0, 1.0) * mzg_strength * a_sub;
        out_rgb = mix(out_rgb, g_sub, m_sub);
    }

    // Суббитный треугольный дизеринг (IGN) подавляет 8-битный бандинг на плавных градиентах стекла
    float ign = fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
    out_rgb = clamp(out_rgb + (ign - 0.5) / 255.0, 0.0, 1.0);

    return vec4(out_rgb, c.a);
}
