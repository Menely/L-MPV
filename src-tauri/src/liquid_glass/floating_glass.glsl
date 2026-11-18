// Adapted from Demetter/ModernGlass modernz.lua (LGPL-2.1).
// Source: https://github.com/Demetter/ModernGlass
// See ModernGlass-LICENSE.txt.

// ModernZ glass for vo=gpu-next: frosts and refracts the video behind ModernZ's glass
// surfaces, adds the light catching their rim and the shadow they cast.
// ModernZ loads this itself and moves the surfaces through glsl-shader-opts.
// Up to four rounded rectangles, in fractions of the video area.

//!PARAM lg_capture
//!TYPE DYNAMIC float
0.0

//!PARAM lg_blur
//!TYPE DYNAMIC float
0.3

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
    float rad = r * HOOKED_size.y;
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
    float u = max(mzg_unit * HOOKED_size.y, 0.25); // pixels per ModernZ layout unit
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

    // a slab whose edge rounds off like a lens: near the rim it takes the picture from
    // further inside and squeezes it toward the edge; the middle stays true
    float e = clamp(1.0 + min(d, 0.0) / (20.0 * u), 0.0, 1.0); // 1 at the edge, 0 inside
    float slope = e / sqrt(max(1.0 - e * e, 0.05));
    // it materializes: the bending and the light grow in with it
    float bend = alpha * mzg_lens * 3.2 * u * slope;
    vec2 q = clamp((p - n * bend) / HOOKED_size, vec2(0.0), vec2(1.0));
    vec3 g = MZG_C_tex(q).rgb;
    // menus are regular glass, frostier than the clear controls: a ring of taps widens the blur
    if (frost > 0.0) {
        vec3 ring = vec3(0.0);
        for (int i = 0; i < 8; i++) {
            float an = 0.7854 * float(i) + 0.3927;
            ring += MZG_C_tex(q + vec2(cos(an), sin(an)) * 4.5 * MZG_C_pt).rgb;
        }
        g = mix(g, (g + ring) / 9.0, frost);
    }

    // L-MPV: the blur slider blends the refracted image with the frosted pass.
    g = mix(HOOKED_tex(q).rgb, g, smoothstep(0.0, 0.55, lg_blur));

    // vibrancy
    float l = dot(g, luma);
    g = clamp(mix(vec3(l), g, 1.35), 0.0, 1.0);

    // legibility: the brighter the picture around it, the deeper the glass (measured over an
    // area, so a bright spot stays brighter than what is around it); dark ones a faint lift
    vec2 o = 10.0 * MZG_C_pt;
    float under = dot(MZG_C_tex(q).rgb + MZG_C_tex(q + vec2(o.x, 0.0)).rgb + MZG_C_tex(q - vec2(o.x, 0.0)).rgb
                      + MZG_C_tex(q + vec2(0.0, o.y)).rgb + MZG_C_tex(q - vec2(0.0, o.y)).rgb, luma) / 5.0;
    g = g * (1.0 - mzg_tone * 0.52 * smoothstep(0.30, 1.0, under)) + mzg_tone * 0.035 * (1.0 - under);

    // the rounded edge darkens toward the rim, so the shape holds over bright pictures
    g *= 1.0 - alpha * mzg_lens * 0.20 * e * e;

    // light: a hairline along the rim, brightest where it faces the light (upper left) and
    // where the light leaves again (lower right), and a soft glow across the rounded edge
    float f = dot(n, vec2(-0.6, -0.8));
    float lit = 0.25 + 0.75 * max(f, 0.0) * max(f, 0.0) + 0.45 * max(-f, 0.0) * max(-f, 0.0);
    float line = exp(-2.0 * (d + 0.8) * (d + 0.8));
    g += alpha * mzg_lens * lit * (0.32 * line);

    float m = clamp(0.5 - d, 0.0, 1.0) * mzg_strength * alpha;
    return vec4(mix(c.rgb, g, m), c.a);
}
