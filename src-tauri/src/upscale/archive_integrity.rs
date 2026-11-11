//! Bounded-memory SHA-256 for downloaded archives.
use std::{
    fs,
    io::{self, BufReader, Read},
    path::Path,
};

#[cfg(test)]
pub(super) fn sha256_bytes(data: &[u8]) -> String {
    sha256_reader(io::Cursor::new(data)).unwrap()
}

fn sha256_reader(mut reader: impl Read) -> io::Result<String> {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut state: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];

    let process_block = |state: &mut [u32; 8], block: &[u8; 64]| {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                block[i * 4],
                block[i * 4 + 1],
                block[i * 4 + 2],
                block[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let mut a = state[0];
        let mut b = state[1];
        let mut c = state[2];
        let mut d = state[3];
        let mut e = state[4];
        let mut f = state[5];
        let mut g = state[6];
        let mut h = state[7];
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = h
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        state[0] = state[0].wrapping_add(a);
        state[1] = state[1].wrapping_add(b);
        state[2] = state[2].wrapping_add(c);
        state[3] = state[3].wrapping_add(d);
        state[4] = state[4].wrapping_add(e);
        state[5] = state[5].wrapping_add(f);
        state[6] = state[6].wrapping_add(g);
        state[7] = state[7].wrapping_add(h);
    };

    let mut total = 0u64;
    let mut block = [0u8; 64];
    let mut used = 0usize;
    loop {
        match reader.read(&mut block[used..]) {
            Ok(0) => break,
            Ok(n) => {
                used += n;
                total = total.wrapping_add(n as u64);
                if used == 64 {
                    process_block(&mut state, &block);
                    used = 0;
                }
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        }
    }
    let mut last_block = [0u8; 128];
    last_block[..used].copy_from_slice(&block[..used]);
    last_block[used] = 0x80;
    let bit_len = total.wrapping_mul(8);
    if used < 56 {
        last_block[56..64].copy_from_slice(&bit_len.to_be_bytes());
        let mut block = [0u8; 64];
        block.copy_from_slice(&last_block[..64]);
        process_block(&mut state, &block);
    } else {
        last_block[120..128].copy_from_slice(&bit_len.to_be_bytes());
        let mut block1 = [0u8; 64];
        let mut block2 = [0u8; 64];
        block1.copy_from_slice(&last_block[..64]);
        block2.copy_from_slice(&last_block[64..128]);
        process_block(&mut state, &block1);
        process_block(&mut state, &block2);
    }

    Ok(format!(
        "{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}",
        state[0], state[1], state[2], state[3], state[4], state[5], state[6], state[7]
    ))
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    sha256_reader(BufReader::with_capacity(256 * 1024, file)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn published_sha256_vectors_cover_padding_and_multiple_blocks() {
        assert_eq!(
            sha256_bytes(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_bytes(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256_bytes(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
        assert_eq!(
            sha256_reader(io::repeat(b'a').take(1_000_000)).unwrap(),
            "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
        );
    }
    #[test]
    fn file_hash_matches_known_vector_without_materializing_file() {
        let path =
            std::env::temp_dir().join(format!("lmpv-sha256-file-{}.bin", std::process::id()));
        fs::write(&path, b"abc").unwrap();
        let digest = sha256_file(&path);
        fs::remove_file(path).unwrap();
        assert_eq!(
            digest.unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn short_reads_and_io_errors_are_handled() {
        struct Short(io::Cursor<Vec<u8>>);
        impl Read for Short {
            fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
                let count = out.len().min(3);
                self.0.read(&mut out[..count])
            }
        }
        assert_eq!(
            sha256_reader(Short(io::Cursor::new(vec![b'a'; 1000]))).unwrap(),
            sha256_bytes(&vec![b'a'; 1000])
        );
        struct Failed;
        impl Read for Failed {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::other("read failed"))
            }
        }
        assert!(sha256_reader(Failed).is_err());
    }
}
