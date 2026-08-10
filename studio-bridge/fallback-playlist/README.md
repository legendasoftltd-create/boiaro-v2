# Fallback playlist — placeholder content

`placeholder-1.mp3` / `placeholder-2.mp3` are generated test tones (220Hz / 330Hz),
used only to prove the Icecast fallback-mount mechanism works end-to-end.

**Replace these before any real broadcast use** with actual standby audio
(music bed, "we'll be right back" announcement, etc.) — that's a content/ops
decision, not something to generate automatically. `playlist.txt` is an
ffmpeg concat-demuxer file; add/remove `file '...'` lines to change what
loops, filenames relative to this directory.
