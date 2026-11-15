//! One bounded disk writer per service. Native frames are returned before disk I/O.
use super::cache::{prune_disk, touch, FrameCache};
use std::{
    fs,
    path::PathBuf,
    sync::{
        mpsc::{sync_channel, SyncSender},
        Arc,
    },
};

enum Job {
    Write {
        epoch: u64,
        root: PathBuf,
        directory: PathBuf,
        key: String,
        bytes: Arc<[u8]>,
    },
    /// Обновление mtime прочитанного кадра (LRU) вне пути запроса.
    Touch { epoch: u64, path: PathBuf },
    /// Файл раскадровки целиком (атомарная замена).
    File {
        epoch: u64,
        root: PathBuf,
        path: PathBuf,
        bytes: Arc<[u8]>,
    },
}

pub(super) struct DiskWriter {
    sender: SyncSender<Job>,
}

impl DiskWriter {
    pub fn new() -> Self {
        let (sender, receiver) = sync_channel::<Job>(16);
        std::thread::spawn(move || {
            let mut writer = FrameCache::default();
            let mut writes = 0usize;
            while let Ok(job) = receiver.recv() {
                let Ok(_lock) = crate::app_cache::IO.lock() else {
                    break;
                };
                match job {
                    Job::Write {
                        epoch,
                        root,
                        directory,
                        key,
                        bytes,
                    } => {
                        if epoch != crate::app_cache::epoch() {
                            continue;
                        }
                        writer.write_disk(&directory, &key, &bytes);
                        writes = writes.wrapping_add(1);
                        if writes == 1 || writes.is_multiple_of(16) {
                            prune_disk(&root);
                        }
                    }
                    Job::Touch { epoch, path } => {
                        if epoch == crate::app_cache::epoch() {
                            touch(&path);
                        }
                    }
                    Job::File {
                        epoch,
                        root,
                        path,
                        bytes,
                    } => {
                        if epoch != crate::app_cache::epoch() {
                            continue;
                        }
                        write_atomic(&path, &bytes);
                        prune_disk(&root);
                    }
                }
            }
        });
        Self { sender }
    }

    pub fn enqueue(&self, root: PathBuf, directory: PathBuf, key: String, bytes: Arc<[u8]>) {
        // A full queue drops expendable disk persistence, not the ready RAM frame.
        let _ = self.sender.try_send(Job::Write {
            epoch: crate::app_cache::epoch(),
            root,
            directory,
            key,
            bytes,
        });
    }

    pub fn touch(&self, path: PathBuf) {
        let _ = self.sender.try_send(Job::Touch {
            epoch: crate::app_cache::epoch(),
            path,
        });
    }

    /// Раскадровка пишется один раз за файл, поэтому ждём место в очереди,
    /// а не теряем результат фонового прохода.
    pub fn store_file(&self, root: PathBuf, path: PathBuf, bytes: Arc<[u8]>) {
        let _ = self.sender.send(Job::File {
            epoch: crate::app_cache::epoch(),
            root,
            path,
            bytes,
        });
    }
}

fn write_atomic(path: &std::path::Path, bytes: &[u8]) {
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    let temporary = path.with_extension("part");
    if fs::write(&temporary, bytes).is_err() {
        let _ = fs::remove_file(&temporary);
        return;
    }
    if fs::rename(&temporary, path).is_err() {
        let _ = fs::remove_file(&temporary);
    }
}
