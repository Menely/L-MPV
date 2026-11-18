//!HOOK OUTPUT
//!BIND HOOKED
//!WHEN 0.5 lg_capture >
//!DESC L-MPV Liquid Glass

float surfaceDistance(vec2 pixel, vec4 bounds, vec2 radii) {
    vec2 halfSize = bounds.zw * HOOKED_size * 0.5;
    vec2 relative = pixel - bounds.xy * HOOKED_size - halfSize;
    float radius = min((relative.y < 0.0 ? radii.x : radii.y) * HOOKED_size.y,
                       min(halfSize.x, halfSize.y));
    vec2 edge = abs(relative) - halfSize + radius;
    return length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0) - radius;
}

#define SURFACE(i) \
    if (lg_w##i > 0.0) { \
        vec4 bounds = vec4(lg_x##i, lg_y##i, lg_w##i, lg_h##i); \
        vec2 radii = vec2(lg_t##i, lg_b##i); \
        float d = surfaceDistance(pixel, bounds, radii); \
        if (d < nearest) { nearest = d; box = bounds; rounded = radii; opacity = lg_a##i; } \
    }

vec4 hook() {
    vec4 original = HOOKED_tex(HOOKED_pos);
    vec2 pixel = HOOKED_pos * HOOKED_size;
    float nearest = 1e6;
    float opacity = 0.0;
    vec4 box = vec4(0.0);
    vec2 rounded = vec2(0.0);
    @SURFACES@
    if (nearest >= 0.5) return original;

    vec2 normal = vec2(
        surfaceDistance(pixel + vec2(1.0, 0.0), box, rounded) - nearest,
        surfaceDistance(pixel + vec2(0.0, 1.0), box, rounded) - nearest);
    normal /= max(length(normal), 0.001);
    float unit = max(lg_unit * HOOKED_size.y, 0.25);
    float rim = 1.0 - smoothstep(0.0, 5.0 * unit, -nearest);
    vec2 sampleAt = clamp(HOOKED_pos - normal * (rim * rim * 4.0 * unit) * HOOKED_pt, 0.0, 1.0);
    vec3 glass = HOOKED_tex(sampleAt).rgb;
    if (lg_blur > 0.0) {
        glass *= 0.28;
        for (int i = 0; i < 8; ++i) {
            float angle = float(i) * 0.785398;
            vec2 offset = vec2(cos(angle), sin(angle)) * (20.0 * lg_blur * unit) * HOOKED_pt;
            glass += 0.09 * HOOKED_tex(clamp(sampleAt + offset, 0.0, 1.0)).rgb;
        }
    }
    float luma = dot(glass, vec3(0.2126, 0.7152, 0.0722));
    glass *= 0.86 - 0.34 * smoothstep(0.25, 0.95, luma);
    return vec4(mix(original.rgb, glass, opacity * clamp(0.5 - nearest, 0.0, 1.0)), original.a);
}
