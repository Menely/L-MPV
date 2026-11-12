//! One bounded disk writer per service. Native frames are returned before disk I/O.
use super::cache::{prune_disk, FrameCache};
use std::{
    path::PathBuf,
    sync::{
        mpsc::{sync_channel, SyncSender},
        Arc,
    },
};

struct Write {
    epoch: u64,
    root: PathBuf,
    directory: PathBuf,
    key: String,
    bytes: Arc<[u8]>,
}
pub(super) struct DiskWriter {
    sender: SyncSender<Write>,
}
impl DiskWriter {
    pub fn new() -> Self {
        let (sender, receiver) = sync_channel::<Write>(16);
        std::thread::spawn(move || {
            let mut writer = FrameCache::default();
            let mut writes = 0usize;
            while let Ok(job) = receiver.recv() {
                let Ok(_lock) = crate::app_cache::IO.lock() else {
                    break;
                };
                if job.epoch != crate::app_cache::epoch() {
                    continue;
                }
                writer.write_disk(&job.directory, &job.key, &job.bytes);
                writes = writes.wrapping_add(1);
                if writes == 1 || writes.is_multiple_of(16) {
                    prune_disk(&job.root);
                }
            }
        });
        Self { sender }
    }
    pub fn enqueue(&self, root: PathBuf, directory: PathBuf, key: String, bytes: Arc<[u8]>) {
        // A full queue drops expendable disk persistence, not the ready RAM frame.
        let _ = self.sender.try_send(Write {
            epoch: crate::app_cache::epoch(),
            root,
            directory,
            key,
            bytes,
        });
    }
}
