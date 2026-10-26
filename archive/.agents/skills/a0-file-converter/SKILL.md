---
name: file-converter
description: Recipes for converting, merging, splitting, and compressing files across formats — documents (PDF/DOCX/MD), data (CSV/JSON/Excel/Parquet/YAML/XML), images (PNG/JPEG/WebP/SVG), audio (MP3/WAV/FLAC/M4A), and archives (ZIP/TAR).
triggers: ["convert", "convert this", "convert to", "transform", "export as", "merge files", "split file", "compress", "extract zip", "csv to", "json to", "pdf to", "docx to", "image to", "audio to"]
---

# File Converter (a0 port)

a0 cannot run shell commands or write files directly. This skill teaches a0 to give the user one-line, copy-pasteable conversion commands using widely-installed tools, picking the simplest tool for the job.

## Decision rule

Always prefer **one** of these (in order):

1. Python stdlib — needs nothing extra
2. Python with one well-known dep (`pandas`, `pillow`, `pyyaml`)
3. `ffmpeg` for audio/video
4. `pandoc` for documents
5. `imagemagick` (`convert`) for image batch ops

Avoid suggesting heavy frameworks (Spark, ImageMagick scripts) for one-off conversions.

## Format → tool map

| From → To | Tool | One-liner |
|---|---|---|
| CSV → JSON | python | `python -c "import pandas as pd; pd.read_csv('in.csv').to_json('out.json', orient='records', indent=2)"` |
| CSV → Excel | python+openpyxl | `python -c "import pandas as pd; pd.read_csv('in.csv').to_excel('out.xlsx', index=False)"` |
| CSV → Parquet | python+pyarrow | `python -c "import pandas as pd; pd.read_csv('in.csv').to_parquet('out.parquet')"` |
| JSON → CSV | python | `python -c "import pandas as pd; pd.read_json('in.json').to_csv('out.csv', index=False)"` |
| Excel → CSV | python | `python -c "import pandas as pd; pd.read_excel('in.xlsx').to_csv('out.csv', index=False)"` |
| YAML ↔ JSON | python+pyyaml | `python -c "import yaml,json,sys; print(json.dumps(yaml.safe_load(open('in.yaml'))))" > out.json` |
| XML → dict/JSON | python+xmltodict | `python -c "import xmltodict,json; print(json.dumps(xmltodict.parse(open('in.xml').read())))"` |
| MD → PDF | pandoc | `pandoc in.md -o out.pdf` |
| MD → DOCX | pandoc | `pandoc in.md -o out.docx` |
| DOCX → MD | pandoc | `pandoc in.docx -o out.md` |
| HTML → PDF | wkhtmltopdf | `wkhtmltopdf in.html out.pdf` |
| PNG ↔ JPEG | python+pillow | `python -c "from PIL import Image; Image.open('in.png').convert('RGB').save('out.jpg')"` |
| Image → WebP | python+pillow | `python -c "from PIL import Image; Image.open('in.png').save('out.webp', 'WEBP', quality=85)"` |
| Resize image | pillow | `python -c "from PIL import Image; Image.open('in.png').resize((800,600)).save('out.png')"` |
| MP3 ↔ WAV | ffmpeg | `ffmpeg -i in.mp3 out.wav` |
| Any → MP3 | ffmpeg | `ffmpeg -i in.flac -b:a 192k out.mp3` |
| Trim audio | ffmpeg | `ffmpeg -i in.mp3 -ss 00:00:10 -to 00:01:30 -c copy out.mp3` |
| ZIP folder | python | `python -c "import shutil; shutil.make_archive('out', 'zip', 'folder/')"` |
| Unzip | python | `python -c "import zipfile; zipfile.ZipFile('in.zip').extractall('out/')"` |
| Merge PDFs | python+pypdf | `python -c "from pypdf import PdfWriter; w=PdfWriter(); [w.append(f) for f in ['a.pdf','b.pdf']]; w.write('merged.pdf')"` |
| Split PDF | python+pypdf | `python -c "from pypdf import PdfReader,PdfWriter; r=PdfReader('in.pdf'); [PdfWriter().add_page(r.pages[i]).write(f'page-{i}.pdf') for i in range(len(r.pages))]"` |

## Procedure

1. Identify source format and target format.
2. Pick the row from the table. If the conversion is not in the table, fall back to: `pandoc` for documents, `ffmpeg` for media, `pandas` for tabular data.
3. Show the install line first if the user likely doesn't have the tool: `pip install pandas openpyxl`.
4. Show the one-liner with the actual filenames the user mentioned.
5. State the one most-likely failure mode (encoding, missing dep, large-file memory).

## Anti-patterns

- Suggesting an online converter — the user is on a Replit shell; keep it local
- Multi-step pipelines when one tool can do it
- Lossy default conversions (e.g. JPEG quality 50) without warning
- Recommending `cat`/`grep` for binary formats
