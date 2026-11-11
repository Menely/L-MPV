//! Only cheap geometric transforms are inherited; never copy playback's upscale graph.
use crate::mpv_manager::MpvManager;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Transforms {
    pub rotation: String,
    pub crop: String,
    pub filters: String,
}
impl Default for Transforms {
    fn default() -> Self {
        Self {
            rotation: "0".into(),
            crop: String::new(),
            filters: String::new(),
        }
    }
}
impl Transforms {
    pub fn read(mpv: &MpvManager) -> Self {
        let vf = mpv.get_property_string("vf").unwrap_or_default();
        Self {
            rotation: mpv
                .get_property_string("video-rotate")
                .unwrap_or_else(|_| "0".into()),
            crop: mpv.get_property_string("video-crop").unwrap_or_default(),
            filters: geometric_filters(&vf),
        }
    }
    pub fn is_identity(&self) -> bool {
        (self.rotation == "0" || self.rotation == "no")
            && self.crop.is_empty()
            && self.filters.is_empty()
    }
    pub fn filter(&self, hdr: Option<super::decoder::HdrTransfer>) -> String {
        format!("{}{}", self.filters, super::filters::software(hdr, false))
    }
}
fn geometric_filters(vf: &str) -> String {
    vf.split(',')
        .filter_map(|entry| {
            let entry = entry.trim();
            let entry = if entry.starts_with('@') {
                entry.split_once(':')?.1
            } else {
                entry
            };
            let (name, args) = entry.split_once('=').unwrap_or((entry, ""));
            match name {
                "hflip" | "vflip" if args.is_empty() => Some(format!("{name},")),
                "crop" | "lavfi-crop"
                    if !args.is_empty()
                        && args.split(':').all(|arg| {
                            let (key, value) = arg.split_once('=').unwrap_or(("", arg));
                            matches!(
                                key,
                                "" | "w"
                                    | "h"
                                    | "x"
                                    | "y"
                                    | "out_w"
                                    | "out_h"
                                    | "keep_aspect"
                                    | "exact"
                            ) && value.parse::<i32>().is_ok()
                        }) =>
                {
                    Some(format!("crop={args},"))
                }
                _ => None,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn preserves_numeric_crop_without_inheriting_heavy_filters() {
        assert_eq!(
            super::geometric_filters("@c:lavfi-crop=w=160:h=180:x=160:y=0,hflip"),
            "crop=w=160:h=180:x=160:y=0,hflip,"
        );
        assert!(super::geometric_filters("lavfi=graph=animejanai,scale=1920:1080").is_empty());
    }
    #[test]
    fn copies_only_supported_geometric_filters() {
        assert_eq!(
            super::geometric_filters("@up:animejanai=lib=x,@mirror:hflip,vflip,scale=400:200"),
            "hflip,vflip,"
        );
    }
}
