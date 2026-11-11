//! Reuse only intervals proven by an actual keyframe seek, never extrapolate.
use std::collections::VecDeque;
const MAX_BYTES: usize = 512 * 1024;
const MAX_ENTRIES: usize = 16;
struct Entry {
    start: f64,
    end: f64,
    bytes: Vec<u8>,
}
#[derive(Default)]
pub(super) struct CoarseCache {
    entries: VecDeque<Entry>,
    bytes: usize,
}
impl CoarseCache {
    pub fn clear(&mut self) {
        self.entries.clear();
        self.bytes = 0;
    }
    pub fn get(&mut self, seconds: f64, exact: bool) -> Option<Vec<u8>> {
        let index = self.entries.iter().rposition(|e| {
            seconds >= e.start && seconds <= e.end && (!exact || seconds == e.start)
        })?;
        let entry = self.entries.remove(index)?;
        let bytes = entry.bytes.clone();
        self.entries.push_back(entry);
        Some(bytes)
    }
    pub fn insert(&mut self, actual: f64, requested: f64, bytes: &[u8]) {
        if !actual.is_finite()
            || !requested.is_finite()
            || actual < 0.0
            || requested < actual
            || requested - actual > 120.0
            || bytes.len() > MAX_BYTES
        {
            return;
        }
        if let Some(entry) = self
            .entries
            .iter_mut()
            .find(|e| e.start == actual)
        {
            entry.end = entry.end.max(requested);
            return;
        }
        self.bytes += bytes.len();
        self.entries.push_back(Entry {
            start: actual,
            end: requested,
            bytes: bytes.to_vec(),
        });
        while self.bytes > MAX_BYTES || self.entries.len() > MAX_ENTRIES {
            if let Some(entry) = self.entries.pop_front() {
                self.bytes -= entry.bytes.len();
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reuses_only_verified_intervals_and_exact_pts() {
        let mut cache = CoarseCache::default();
        cache.insert(10.0, 14.0, b"frame");
        assert_eq!(cache.get(12.0, false).unwrap(), b"frame");
        assert!(cache.get(9.99, false).is_none());
        assert!(cache.get(14.01, false).is_none());
        assert!(cache.get(12.0, true).is_none());
        assert!(cache.get(10.0, true).is_some());
        cache.insert(10.0, 18.0, b"same frame");
        assert!(cache.get(17.0, false).is_some());
        cache.insert(30.0, 20.0, b"future keyframe");
        assert!(cache.get(25.0, false).is_none());
        cache.clear();
        assert!(cache.get(10.0, false).is_none());
    }
    #[test]
    fn bounds_encoded_memory() {
        let mut cache = CoarseCache::default();
        for i in 0..50 {
            cache.insert(i as f64, i as f64 + 0.5, &vec![0; 100_000]);
        }
        assert!(cache.bytes <= MAX_BYTES && cache.entries.len() <= MAX_ENTRIES);
        assert!(cache.get(0.0, false).is_none());
        assert!(cache.get(49.0, false).is_some());
    }
}
