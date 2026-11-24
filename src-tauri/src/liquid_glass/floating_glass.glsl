// Adapted from Demetter/ModernGlass modernz.lua (LGPL-2.1).
// Source: https://github.com/Demetter/ModernGlass
// See ModernGlass-LICENSE.txt.

// ModernZ glass for vo=gpu-next: frosts and refracts the video behind glass
// surfaces, adds the light catching their rim and the shadow they cast.
// Loaded by L-MPV and updated through glsl-shader-opts.
// Up to twelve rounded rectangles, in fractions of the video area.

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
    // gaussian, sigma 3 texels (about 12 px at 1080p), as 11 bilinear taps: frosted lightly,
    // so the picture stays recognizable through the clear glass
    const float w[6] = float[](0.13304, 0.23238, 0.13539, 0.05118, 0.01254, 0.00199);
    const float o[6] = float[](0.0, 1.4584, 3.4040, 5.3518, 7.3029, 9.2582);
    vec4 c = MZG_A_tex(MZG_A_pos) * w[0];
    for (int i = 1; i < 6; i++) {
        vec2 d = vec2(o[i] * MZG_A_pt.x, 0.0);
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
    vec4 c = MZG_B_tex(MZG_B_pos) * w[0];
    for (int i = 1; i < 6; i++) {
        vec2 d = vec2(0.0, o[i] * MZG_B_pt.y);
        c += (MZG_B_tex(MZG_B_pos + d) + MZG_B_tex(MZG_B_pos - d)) * w[i];
    }
    return c;
}

//!HOOK OUTPUT
//!BIND HOOKED
//!BIND MZG_C
//!WHEN mzg_on 0.5 lg_capture > *
//!DESC [ModernZ] glass: composite

// signed distance (in pixels) to a rounded rectangle given in fractions of the video
float mzg_box(vec2 p, float x, float y, float w, float h, float r) {
    vec2 half_size = 0.5 * vec2(w, h) * HOOKED_size;
    float rad = min(r * HOOKED_size.y, min(half_size.x, half_size.y));
    vec2 q = abs(p - (vec2(x, y) * HOOKED_size + half_size)) - half_size + rad;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

// distance to the nearest surface; its opacity (it may be fading in or out) goes to a,
// its frost to f
float mzg_sdf_a(vec2 p, out float a, out float f) {
    float d = 1e6, k;
    a = 1.0;
    f = 0.0;
    if (mzg_0w > 0.0) { k = mzg_box(p, mzg_0x, mzg_0y, mzg_0w, mzg_0h, mzg_0r); if (k < d) { d = k; a = mzg_0a; f = mzg_0f; } }
    if (mzg_1w > 0.0) { k = mzg_box(p, mzg_1x, mzg_1y, mzg_1w, mzg_1h, mzg_1r); if (k < d) { d = k; a = mzg_1a; f = mzg_1f; } }
    if (mzg_2w > 0.0) { k = mzg_box(p, mzg_2x, mzg_2y, mzg_2w, mzg_2h, mzg_2r); if (k < d) { d = k; a = mzg_2a; f = mzg_2f; } }
    if (mzg_3w > 0.0) { k = mzg_box(p, mzg_3x, mzg_3y, mzg_3w, mzg_3h, mzg_3r); if (k < d) { d = k; a = mzg_3a; f = mzg_3f; } }
    if (mzg_4w > 0.0) { k = mzg_box(p, mzg_4x, mzg_4y, mzg_4w, mzg_4h, mzg_4r); if (k < d) { d = k; a = mzg_4a; f = mzg_4f; } }
    if (mzg_5w > 0.0) { k = mzg_box(p, mzg_5x, mzg_5y, mzg_5w, mzg_5h, mzg_5r); if (k < d) { d = k; a = mzg_5a; f = mzg_5f; } }
    if (mzg_6w > 0.0) { k = mzg_box(p, mzg_6x, mzg_6y, mzg_6w, mzg_6h, mzg_6r); if (k < d) { d = k; a = mzg_6a; f = mzg_6f; } }
    if (mzg_7w > 0.0) { k = mzg_box(p, mzg_7x, mzg_7y, mzg_7w, mzg_7h, mzg_7r); if (k < d) { d = k; a = mzg_7a; f = mzg_7f; } }
    if (mzg_8w > 0.0) { k = mzg_box(p, mzg_8x, mzg_8y, mzg_8w, mzg_8h, mzg_8r); if (k < d) { d = k; a = mzg_8a; f = mzg_8f; } }
    if (mzg_9w > 0.0) { k = mzg_box(p, mzg_9x, mzg_9y, mzg_9w, mzg_9h, mzg_9r); if (k < d) { d = k; a = mzg_9a; f = mzg_9f; } }
    if (mzg_10w > 0.0) { k = mzg_box(p, mzg_10x, mzg_10y, mzg_10w, mzg_10h, mzg_10r); if (k < d) { d = k; a = mzg_10a; f = mzg_10f; } }
    if (mzg_11w > 0.0) { k = mzg_box(p, mzg_11x, mzg_11y, mzg_11w, mzg_11h, mzg_11r); if (k < d) { d = k; a = mzg_11a; f = mzg_11f; } }
    return d;
}

float mzg_sdf(vec2 p) {
    float a, f;
    return mzg_sdf_a(p, a, f);
}

vec4 hook() {
    const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
    vec4 c = HOOKED_tex(HOOKED_pos);
    vec2 p = HOOKED_pos * HOOKED_size;
    float u = max(mzg_unit * HOOKED_size.y, 0.25); // pixels per layout unit
    float alpha, frost;
    float d = mzg_sdf_a(p, alpha, frost);
    if (d > 48.0 * u)
        return c;

    if (d > 0.0) {
        // the shadow the glass casts: wide, soft, and a little deeper over bright pictures
        if (mzg_shadow > 0.0) {
            float sa, sf;
            float ds = max(mzg_sdf_a(p - vec2(0.0, 8.0 * u), sa, sf), 0.0) / (18.0 * u);
            float under = dot(MZG_C_tex(HOOKED_pos).rgb, luma);
            float k = mzg_shadow * sa * mix(0.05, 0.13, smoothstep(0.15, 0.85, under));
            c.rgb *= 1.0 - k * exp(-0.5 * ds * ds);
        }
        if (d >= 0.5)
            return c;
    }

    // outward normal of the nearest edge
    vec2 nx = vec2(1.0, 0.0);
    vec2 n = vec2(mzg_sdf(p + nx.xy) - mzg_sdf(p - nx.xy), mzg_sdf(p + nx.yx) - mzg_sdf(p - nx.yx));
    n = dot(n, n) > 1e-8 ? normalize(n) : vec2(0.0, -1.0);

    // Apple Liquid Glass rim lens: deep curved refraction with subtle RGB dispersion
    // along the bevel, fading smoothly into the frosted interior.
    float e = clamp(1.0 + min(d, 0.0) / (32.0 * u), 0.0, 1.0); // 1 at the edge, 0 inside
    float slope = e / sqrt(max(1.0 - e * e, 0.04));
    float bend = alpha * mzg_lens * u * (22.0 * pow(e, 1.6) + 6.0 * slope);
    vec2 q = clamp((p - n * bend) / HOOKED_size, vec2(0.0), vec2(1.0));

    float chroma = alpha * mzg_lens * 2.2 * u * e * e;
    vec2 qR = clamp((p - n * (bend + chroma)) / HOOKED_size, vec2(0.0), vec2(1.0));
    vec2 qB = clamp((p - n * max(bend - chroma, 0.0)) / HOOKED_size, vec2(0.0), vec2(1.0));

    vec3 g = vec3(MZG_C_tex(qR).r, MZG_C_tex(q).g, MZG_C_tex(qB).b);
    // popovers are regular glass, frostier than clear controls: a ring of taps widens the blur
    if (frost > 0.0) {
        vec3 ring = vec3(0.0);
        for (int i = 0; i < 8; i++) {
            float an = 0.7854 * float(i) + 0.3927;
            ring += MZG_C_tex(q + vec2(cos(an), sin(an)) * 4.5 * MZG_C_pt).rgb;
        }
        g = mix(g, (g + ring) / 9.0, frost);
    }

    // Keep the refracted bevel crisp enough to read the curved background distortion,
    // while honoring the user's blur slider across the body of the glass.
    vec2 tang = vec2(-n.y, n.x) * (1.25 * u / HOOKED_size);
    vec3 refracted = vec3(
        (HOOKED_tex(qR).r + HOOKED_tex(clamp(qR + tang, vec2(0.0), vec2(1.0))).r + HOOKED_tex(clamp(qR - tang, vec2(0.0), vec2(1.0))).r) / 3.0,
        (HOOKED_tex(q).g + HOOKED_tex(clamp(q + tang, vec2(0.0), vec2(1.0))).g + HOOKED_tex(clamp(q - tang, vec2(0.0), vec2(1.0))).g) / 3.0,
        (HOOKED_tex(qB).b + HOOKED_tex(clamp(qB + tang, vec2(0.0), vec2(1.0))).b + HOOKED_tex(clamp(qB - tang, vec2(0.0), vec2(1.0))).b) / 3.0
    );
    float clear = 1.0 - clamp(lg_blur, 0.0, 1.0);
    float body_frost = 1.0 - clear * clear;
    float rim_clarity = smoothstep(0.22, 0.94, e) * alpha * mzg_lens;
    float local_frost = mix(body_frost, body_frost * 0.16, rim_clarity);
    g = mix(refracted, g, local_frost);

    // vibrancy
    float l = dot(g, luma);
    g = clamp(mix(vec3(l), g, 1.38), 0.0, 1.0);

    // legibility: darken bright scenes slightly while lifting deep blacks
    vec2 o = 10.0 * MZG_C_pt;
    float under = dot(MZG_C_tex(q).rgb + MZG_C_tex(q + vec2(o.x, 0.0)).rgb + MZG_C_tex(q - vec2(o.x, 0.0)).rgb
                      + MZG_C_tex(q + vec2(0.0, o.y)).rgb + MZG_C_tex(q - vec2(0.0, o.y)).rgb, luma) / 5.0;
    g = g * (1.0 - mzg_tone * 0.45 * smoothstep(0.30, 1.0, under)) + mzg_tone * 0.03 * (1.0 - under);

    // subtle specular rim highlight + soft inner bevel glow
    float f = dot(n, vec2(-0.6, -0.8));
    float lit = 0.22 + 0.78 * max(f, 0.0) * max(f, 0.0) + 0.42 * max(-f, 0.0) * max(-f, 0.0);
    float line = exp(-2.8 * (d + 0.65) * (d + 0.65));
    g += alpha * mzg_lens * lit * (0.20 * line + 0.07 * pow(e, 2.5));

    float m = clamp(0.5 - d, 0.0, 1.0) * mzg_strength * alpha;
    return vec4(mix(c.rgb, g, m), c.a);
}
