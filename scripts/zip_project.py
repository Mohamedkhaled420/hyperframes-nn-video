import os, zipfile
SRC = '/home/z/my-project/download/hyperframes_nn_video'
DST = '/home/z/my-project/download/hyperframes_nn_video.zip'
EXCL_DIRS = {'node_modules', 'render'}
EXCL_FILES = {'bun.lock', 'bun.lockb', 'package-lock.json'}
n = 0
with zipfile.ZipFile(DST, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in EXCL_DIRS]
        for f in files:
            if f in EXCL_FILES: continue
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, os.path.dirname(SRC)))
            n += 1
print(DST, f'{os.path.getsize(DST)/1048576:.1f} MB,', n, 'files')
