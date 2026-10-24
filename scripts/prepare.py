"""Restore bundled, checksummed inputs; fetch pinned libigl source once."""
from pathlib import Path
import gzip
import hashlib
import json
import shutil
import tarfile
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
LIBIGL_SHA='fdaac01bcc52888994f7afd029dcc045dd408484'
LIBIGL_ARCHIVE_SHA='0c727f745a7096eebbef17d221d5cb3f3148d4c57ed0df3df698a8cf6b1dffca'

def check(path,expected):
    actual=hashlib.sha256(path.read_bytes()).hexdigest()
    if actual!=expected: raise ValueError(f'Checksum mismatch for {path.name}: {actual}')

def main():
    sources=json.loads((ROOT/'assets/manifest.json').read_text())
    for name,item in sources['files'].items():
        path=ROOT/'assets'/name
        if not path.exists(): path.write_bytes(gzip.decompress((ROOT/'assets'/item['bundle']).read_bytes()))
        check(path,item['sha256'])
        print(f'Verified {name}')
    directory=ROOT/'third_party/libigl'
    if not directory.exists():
        archive=ROOT/'third_party/libigl.tar.gz'
        if not archive.exists():
            with urllib.request.urlopen(f'https://codeload.github.com/libigl/libigl/tar.gz/{LIBIGL_SHA}',timeout=120) as response:
                archive.write_bytes(response.read())
        check(archive,LIBIGL_ARCHIVE_SHA)
        with tarfile.open(archive) as tar: tar.extractall(ROOT/'third_party',filter='data')
        (ROOT/'third_party'/f'libigl-{LIBIGL_SHA}').rename(directory)
    print('Prepared inputs and libigl v2.5.0 are available.')

if __name__=='__main__': main()
