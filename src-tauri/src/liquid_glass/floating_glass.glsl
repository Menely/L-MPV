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
0.9

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
    // Variable-radius 11-tap separable Gaussian:
    // Forms the smooth optical base texture for both the refracted bevel and the frosted interior.
    const float w[6] = float[](0.13304, 0.23238, 0.13539, 0.05118, 0.01254, 0.00199);
    const float o[6] = float[](0.0, 1.4584, 3.4040, 5.3518, 7.3029, 9.2582);
    float blur_scale = mix(0.05, 1.38, clamp(lg_blur, 0.0, 1.0));
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
    float blur_scale = mix(0.05, 1.38, clamp(lg_blur, 0.0, 1.0));
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
//!BIND MZG_C
//!WHEN mzg_on 0.5 lg_capture > *
//!DESC [ModernZ] glass: composite

// Single-pass analytical SDF with C-infinity smooth corner normals and rounded inner bevel depth.
// Eliminates the medial-axis C0 ridge and inner rectangle corner discontinuities inside cards.
float mzg_box_n(vec2 p, float x, float y, float w, float h, float r, out float mh, out float d_bevel, out vec2 bn) {
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

    // Smooth R-function interior corner distance so deep bevels curve cleanly around corners
    vec2 neg_q = max(-q, 0.0);
    float neg_r = (neg_q.x * neg_q.y) / max(length(neg_q), 1e-4);
    float ridge = mix(min(neg_q.x, neg_q.y), neg_r, 0.85);
    d_bevel = out_len - ridge - rad;

    // Numerically stable softplus + smooth axis-symmetry sign:
    // Smoothly crosses 0 along rel.x = 0 and rel.y = 0, eliminating the horizontal/vertical
    // normal-flip seam across the middle of multi-row cards.
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
        if (k < d) { d = k; d_bevel = kd_bev; a = mzg_##idx##a; f = mzg_##idx##f; mh = kmh; n = kn; } \
    }

float mzg_sdf_full(vec2 p, out float d_bevel, out float a, out float f, out float mh, out vec2 n) {
    float d = 1e6, k, kmh, kd_bev;
    vec2 kn;
    d_bevel = 1e6;
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

vec4 hook() {
    const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
    vec4 c = HOOKED_tex(HOOKED_pos);
    vec2 p = HOOKED_pos * HOOKED_size;
    float u = max(mzg_unit * HOOKED_size.y, 0.25); // pixels per layout unit
    float d_bevel, alpha, frost, min_half;
    vec2 n;
    float d = mzg_sdf_full(p, d_bevel, alpha, frost, min_half, n);

    // Early exit outside glass surface: eliminates external shadow halo and saves ~50% GPU fragment work
    if (d >= 0.5)
        return c;

    float user_blur = clamp(lg_blur, 0.0, 1.0);

    // Telegram / Kyant0 AndroidLiquidGlass & Apple iOS 26 continuous C2 dome profile:
    // Uses smooth interior corner distance (d_bevel) and smooth normal field so corner bevels never pinch.
    float thickness = min(min_half * 0.78, 30.0 * u);
    float rim_t = clamp(1.0 + d_bevel / max(thickness, 1.0), 0.0, 1.0);
    float bevel_smooth = rim_t * rim_t * (3.0 - 2.0 * rim_t);
    float n_cos = bevel_smooth * (0.88 + 0.12 * rim_t);
    float n_cos2 = n_cos * n_cos;
    float n_sin = sqrt(max(1.0 - n_cos2 * 0.82, 0.06));
    vec3 normal = normalize(vec3(n * n_cos, n_sin));

    // 3D Snell refraction (IOR = 1.52) with blur-compensated lens magnification so edge bending
    // stays vivid and fluid even at high blur percentages.
    vec3 refract_vec = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / 1.52);
    float dome_h = thickness * sqrt(max(1.0 - bevel_smooth * bevel_smooth, 0.0));
    float refract_length = (dome_h + 9.2 * thickness) / max(-refract_vec.z, 0.18);
    float blur_lens_boost = 1.0 + 0.42 * user_blur * bevel_smooth;
    vec2 disp_vec = refract_vec.xy * refract_length * (0.58 * mzg_lens * blur_lens_boost);

    vec2 q = clamp((p + disp_vec) / HOOKED_size, vec2(0.0), vec2(1.0));

    // Prismatic chromatic dispersion along the refracted ray on the outer bevel
    vec2 chroma_vec = disp_vec * (0.085 * bevel_smooth);
    vec2 qR = clamp((p + disp_vec + chroma_vec) / HOOKED_size, vec2(0.0), vec2(1.0));
    vec2 qB = clamp((p + disp_vec - chroma_vec) / HOOKED_size, vec2(0.0), vec2(1.0));

    // Continuous variable-radius multi-scale blur over MZG_C:
    // Instead of mixing an unblurred buffer with a blurred buffer (which causes a visible step/halo),
    // the kernel spread radius smoothly contracts from the frosted center toward the refracting edge
    // across the entire C2 bevel curve.
    float interior_factor = 1.0 - 0.86 * bevel_smooth;
    float spread = user_blur * (1.55 + 1.15 * frost) * interior_factor;
    vec2 s1 = vec2(1.0, 0.0) * spread * MZG_C_pt;
    vec2 s2 = vec2(0.0, 1.0) * spread * MZG_C_pt;
    vec2 s3 = vec2(0.7071, 0.7071) * spread * MZG_C_pt;
    vec2 s4 = vec2(-0.7071, 0.7071) * spread * MZG_C_pt;

    // Anisotropic tangent/normal rim integration + isotropic center frosting in a unified tap set
    vec2 rim_streak = n * (bevel_smooth * 1.45 * user_blur) * MZG_C_pt;
    vec3 blur_center = vec3(MZG_C_tex(qR).r, MZG_C_tex(q).g, MZG_C_tex(qB).b);
    vec3 blur_edge = 0.5 * (
        vec3(MZG_C_tex(qR + rim_streak).r, MZG_C_tex(q + rim_streak).g, MZG_C_tex(qB + rim_streak).b) +
        vec3(MZG_C_tex(qR - rim_streak).r, MZG_C_tex(q - rim_streak).g, MZG_C_tex(qB - rim_streak).b)
    );
    vec3 ring_g = (
        MZG_C_tex(q + s1).rgb + MZG_C_tex(q - s1).rgb +
        MZG_C_tex(q + s2).rgb + MZG_C_tex(q - s2).rgb +
        MZG_C_tex(q + s3).rgb + MZG_C_tex(q - s3).rgb +
        MZG_C_tex(q + s4).rgb + MZG_C_tex(q - s4).rgb
    ) * 0.125;

    float ring_weight = clamp(user_blur * (0.68 + 0.20 * frost) * interior_factor, 0.0, 0.85);
    vec3 base_glass = mix(blur_center, blur_edge, 0.42 * bevel_smooth);
    vec3 blur_g = mix(base_glass, ring_g, ring_weight);

    // Smooth blend to raw crystal only when the user explicitly sets the blur slider below 15%
    vec3 g = blur_g;
    if (user_blur < 0.15) {
        vec3 raw_clear = vec3(HOOKED_tex(qR).r, HOOKED_tex(q).g, HOOKED_tex(qB).b);
        g = mix(raw_clear, blur_g, smoothstep(0.0, 0.15, user_blur));
    }

    // Vibrancy: keep refracted colors luminous like optical crystal
    float l = dot(g, luma);
    g = clamp(mix(vec3(l), g, 1.36), 0.0, 1.0);

    // Uniform local legibility toning (no wide off-surface taps that darken edges near bright skies)
    float under = dot(blur_g, luma);
    g = g * (1.0 - mzg_tone * 0.34 * smoothstep(0.38, 1.0, under)) + mzg_tone * 0.03 * (1.0 - under);

    // Resolution-independent dual-lobe Fresnel specular rim + soft inner caustic sheen (Telegram / Apple style)
    float light_dir = dot(n, normalize(vec2(-0.58, -0.81)));
    float fp = max(light_dir, 0.0);
    float fn = max(-light_dir, 0.0);
    float lit = 0.16 + 0.84 * (fp * fp) + 0.44 * (fn * fn);
    float d_u = d / max(u, 0.5);
    float rim_line = exp(-2.6 * (d_u + 0.50) * (d_u + 0.50));
    float bright_guard = mix(1.0, 0.65, smoothstep(0.45, 0.95, under));
    g += mzg_lens * lit * bright_guard * (0.22 * rim_line + 0.045 * (n_cos2 * bevel_smooth));

    float m = clamp(0.5 - d, 0.0, 1.0) * mzg_strength * alpha;
    return vec4(mix(c.rgb, g, m), c.a);
}
