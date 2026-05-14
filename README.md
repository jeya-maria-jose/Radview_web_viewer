# DICOM / NIfTI Web Viewer

A local-first web viewer for DICOM folders, `.nii`, `.nii.gz`, and dataset-native `.npz` segmentation masks with four synchronized views:

- Axial, sagittal, and coronal slice canvases
- Interactive 3D volume view
- Optional NIfTI segmentation mask overlay
- Per-class segmentation opacity controls
- Side report viewer with rule-based important finding highlights

The app uses a small Python/Flask backend so it can load paths from the local machine or VM filesystem. The browser UI talks to that backend and renders the volume.

## Quick Start

```bash
cd /Users/jeyamariajose/Downloads/dicom-nifti-web-viewer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open:

```text
http://127.0.0.1:5055
```

On Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

## Loading Data

Use the volume path field for either:

- A DICOM series folder
- A `.nii` file
- A `.nii.gz` file

Use the segmentation field for a registered `.nii`, `.nii.gz`, or `.npz` mask. For `.npz`, the app uses the `mask` array when present, otherwise the only array in the archive. Segmentation labels are detected from nonzero integer values and each label gets its own opacity slider.

Use the report path field for `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.html`, `.rtf`, `.pdf`, `.docx`, or DICOM report files. Highlighting is rule-based and intended to help scan reports faster; it is not a diagnostic interpretation.

## Notes

- DICOM support is designed for single-series folders. If a folder contains several series, the app loads the largest series it finds.
- Compressed DICOM support depends on the installed `pylibjpeg` plugins listed in `requirements.txt`.
- Segmentation masks must match the loaded volume dimensions after NIfTI orientation is mapped into the viewer.
- The 3D panel uses sampled point-cloud rendering for responsiveness in a browser. It is useful for inspection and class overlay context, not a replacement for diagnostic volume rendering.
