const elements = {
  volumePath: document.querySelector("#volumePath"),
  segPath: document.querySelector("#segPath"),
  reportPath: document.querySelector("#reportPath"),
  loadVolumeBtn: document.querySelector("#loadVolumeBtn"),
  loadSegBtn: document.querySelector("#loadSegBtn"),
  loadReportBtn: document.querySelector("#loadReportBtn"),
  statusText: document.querySelector("#statusText"),
  shapeText: document.querySelector("#shapeText"),
  spacingText: document.querySelector("#spacingText"),
  windowText: document.querySelector("#windowText"),
  axialSlider: document.querySelector("#axialSlider"),
  coronalSlider: document.querySelector("#coronalSlider"),
  sagittalSlider: document.querySelector("#sagittalSlider"),
  axialIndex: document.querySelector("#axialIndex"),
  coronalIndex: document.querySelector("#coronalIndex"),
  sagittalIndex: document.querySelector("#sagittalIndex"),
  threeStatus: document.querySelector("#threeStatus"),
  windowLow: document.querySelector("#windowLow"),
  windowHigh: document.querySelector("#windowHigh"),
  densitySlider: document.querySelector("#densitySlider"),
  flipToggles: document.querySelectorAll(".flip-toggle"),
  reportStatus: document.querySelector("#reportStatus"),
  findingsList: document.querySelector("#findingsList"),
  reportContent: document.querySelector("#reportContent"),
  classControls: document.querySelector("#classControls"),
  axialCanvas: document.querySelector("#axialCanvas"),
  coronalCanvas: document.querySelector("#coronalCanvas"),
  sagittalCanvas: document.querySelector("#sagittalCanvas"),
  threeCanvas: document.querySelector("#threeCanvas"),
};

const state = {
  volumeMeta: null,
  volumeData: null,
  segMeta: null,
  segData: null,
  dims: [0, 0, 0],
  slices: { axial: 0, coronal: 0, sagittal: 0 },
  flips: {
    axial: { horizontal: false, vertical: false },
    coronal: { horizontal: false, vertical: false },
    sagittal: { horizontal: false, vertical: true },
  },
  window: { low: 0, high: 1 },
  classSettings: new Map(),
  three: {
    points: [],
    segPoints: new Map(),
    rotX: -0.35,
    rotY: 0.55,
    zoom: 1.35,
    dragging: false,
    lastX: 0,
    lastY: 0,
  },
};

function setStatus(message, isError = false) {
  elements.statusText.textContent = message;
  elements.statusText.style.color = isError ? "var(--danger)" : "var(--text)";
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error || "Request failed.");
  }
  return json;
}

async function fetchArrayBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Binary fetch failed.");
  }
  return response.arrayBuffer();
}

function indexOf(z, y, x) {
  const [, height, width] = state.dims;
  return (z * height + y) * width + x;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function setReportStatus(message, isError = false) {
  elements.reportStatus.textContent = message;
  elements.reportStatus.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function severityRank(severity) {
  if (severity === "critical") return 0;
  if (severity === "high") return 1;
  return 2;
}

function findingRegex(findings) {
  const terms = [...new Set(findings.map((finding) => finding.term).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return null;
  return new RegExp(`\\b(${terms.join("|")})\\w*\\b`, "gi");
}

function severityForTerm(term, findings) {
  const lowerTerm = term.toLowerCase();
  const match = findings
    .filter((finding) => lowerTerm.startsWith(finding.term.toLowerCase()))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0];
  return match ? match.severity : "moderate";
}

function renderReportText(text, findings) {
  elements.reportContent.innerHTML = "";
  const regex = findingRegex(findings);
  if (!regex) {
    elements.reportContent.textContent = text;
    return;
  }

  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      elements.reportContent.append(document.createTextNode(text.slice(lastIndex, start)));
    }

    const highlight = document.createElement("mark");
    highlight.className = `report-highlight ${severityForTerm(match[0], findings)}`;
    highlight.textContent = match[0];
    elements.reportContent.append(highlight);
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    elements.reportContent.append(document.createTextNode(text.slice(lastIndex)));
  }
}

function renderFindings(findings) {
  elements.findingsList.innerHTML = "";
  if (!findings.length) {
    const empty = document.createElement("div");
    empty.className = "finding-empty";
    empty.textContent = "No rule-based flags found";
    elements.findingsList.append(empty);
    return;
  }

  for (const finding of findings) {
    const item = document.createElement("div");
    item.className = `finding-item ${finding.severity}`;

    const header = document.createElement("div");
    header.className = "finding-header";

    const term = document.createElement("strong");
    term.textContent = finding.term;

    const meta = document.createElement("span");
    meta.textContent = `${finding.severity} x ${finding.count}`;

    const context = document.createElement("p");
    context.textContent = finding.context || "";

    header.append(term, meta);
    item.append(header, context);
    elements.findingsList.append(item);
  }
}

function configureControls(meta) {
  const [depth, height, width] = meta.shape;
  state.dims = meta.shape;
  state.slices.axial = Math.floor(depth / 2);
  state.slices.coronal = Math.floor(height / 2);
  state.slices.sagittal = Math.floor(width / 2);
  state.window.low = meta.intensityMin;
  state.window.high = meta.intensityMax;

  elements.axialSlider.max = String(depth - 1);
  elements.coronalSlider.max = String(height - 1);
  elements.sagittalSlider.max = String(width - 1);
  elements.axialSlider.value = String(state.slices.axial);
  elements.coronalSlider.value = String(state.slices.coronal);
  elements.sagittalSlider.value = String(state.slices.sagittal);

  for (const slider of [elements.axialSlider, elements.coronalSlider, elements.sagittalSlider]) {
    slider.disabled = false;
  }

  elements.windowLow.disabled = false;
  elements.windowHigh.disabled = false;
  elements.densitySlider.disabled = false;
  elements.windowLow.value = "0";
  elements.windowHigh.value = "1000";
  elements.loadSegBtn.disabled = false;

  elements.shapeText.textContent = `Z ${depth} / Y ${height} / X ${width}`;
  elements.spacingText.textContent = meta.spacing.map((v) => `${v.toFixed(3)} mm`).join(" / ");
  updateWindowText();
}

function updateWindowFromSliders() {
  const min = state.volumeMeta.intensityMin;
  const max = state.volumeMeta.intensityMax;
  const lowT = Number(elements.windowLow.value) / 1000;
  const highT = Number(elements.windowHigh.value) / 1000;
  const sortedLow = Math.min(lowT, highT - 0.01);
  const sortedHigh = Math.max(highT, sortedLow + 0.01);
  state.window.low = min + (max - min) * sortedLow;
  state.window.high = min + (max - min) * sortedHigh;
  updateWindowText();
}

function updateWindowText() {
  elements.windowText.textContent = `${state.window.low.toFixed(1)} to ${state.window.high.toFixed(1)}`;
}

function planeSpec(plane) {
  const [depth, height, width] = state.dims;
  const [sz, sy, sx] = state.volumeMeta.spacing;
  if (plane === "axial") {
    const z = state.slices.axial;
    return {
      width,
      height,
      physicalWidth: width * sx,
      physicalHeight: height * sy,
      label: z,
      sample: (row, col) => indexOf(z, row, col),
    };
  }

  if (plane === "coronal") {
    const y = state.slices.coronal;
    return {
      width,
      height: depth,
      physicalWidth: width * sx,
      physicalHeight: depth * sz,
      label: y,
      sample: (row, col) => indexOf(row, y, col),
    };
  }

  const x = state.slices.sagittal;
  return {
    width: height,
    height: depth,
    physicalWidth: height * sy,
    physicalHeight: depth * sz,
    label: x,
    sample: (row, col) => indexOf(row, col, x),
  };
}

function resizeCanvasToPanel(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
}

function targetRectForAspect(canvas, physicalWidth, physicalHeight) {
  const sliceAspect = Math.max(0.0001, physicalWidth / Math.max(0.0001, physicalHeight));
  const panelAspect = canvas.width / Math.max(1, canvas.height);

  let width = canvas.width;
  let height = canvas.height;
  if (panelAspect > sliceAspect) {
    height = canvas.height;
    width = height * sliceAspect;
  } else {
    width = canvas.width;
    height = width / sliceAspect;
  }

  return {
    x: (canvas.width - width) * 0.5,
    y: (canvas.height - height) * 0.5,
    width,
    height,
  };
}

function drawOrientedImage(ctx, image, target, plane) {
  const flip = state.flips[plane];
  ctx.save();
  ctx.translate(target.x + target.width * 0.5, target.y + target.height * 0.5);
  ctx.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1);
  ctx.drawImage(image, -target.width * 0.5, -target.height * 0.5, target.width, target.height);
  ctx.restore();
}

function drawPlane(plane, canvas, output) {
  if (!state.volumeData) return;

  const spec = planeSpec(plane);
  const offscreen = document.createElement("canvas");
  offscreen.width = spec.width;
  offscreen.height = spec.height;
  const offscreenCtx = offscreen.getContext("2d");
  const image = offscreenCtx.createImageData(spec.width, spec.height);
  const rgba = image.data;

  const ctx = canvas.getContext("2d");
  const range = Math.max(0.00001, state.window.high - state.window.low);

  for (let row = 0; row < spec.height; row += 1) {
    for (let col = 0; col < spec.width; col += 1) {
      const pixelIndex = row * spec.width + col;
      const volumeIndex = spec.sample(row, col);
      const value = state.volumeData[volumeIndex];
      const gray = clamp(Math.round(((value - state.window.low) / range) * 255), 0, 255);

      let r = gray;
      let g = gray;
      let b = gray;

      if (state.segData) {
        const label = state.segData[volumeIndex];
        const settings = state.classSettings.get(label);
        if (settings && settings.opacity > 0) {
          r = Math.round(r * (1 - settings.opacity) + settings.rgb.r * settings.opacity);
          g = Math.round(g * (1 - settings.opacity) + settings.rgb.g * settings.opacity);
          b = Math.round(b * (1 - settings.opacity) + settings.rgb.b * settings.opacity);
        }
      }

      const offset = pixelIndex * 4;
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = 255;
    }
  }

  offscreenCtx.putImageData(image, 0, 0);
  resizeCanvasToPanel(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#030407";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  const target = targetRectForAspect(canvas, spec.physicalWidth, spec.physicalHeight);
  drawOrientedImage(ctx, offscreen, target, plane);
  output.textContent = `${spec.label + 1} / ${planeMax(plane) + 1}`;
}

function planeMax(plane) {
  const [depth, height, width] = state.dims;
  if (plane === "axial") return depth - 1;
  if (plane === "coronal") return height - 1;
  return width - 1;
}

function renderSlices() {
  drawPlane("axial", elements.axialCanvas, elements.axialIndex);
  drawPlane("coronal", elements.coronalCanvas, elements.coronalIndex);
  drawPlane("sagittal", elements.sagittalCanvas, elements.sagittalIndex);
}

function makeClassControls(segMeta) {
  state.classSettings.clear();
  elements.classControls.innerHTML = "";

  if (!segMeta.classes.length) {
    elements.classControls.className = "empty-state";
    elements.classControls.textContent = "Mask loaded, but no nonzero classes were found";
    return;
  }

  elements.classControls.className = "";
  for (const classInfo of segMeta.classes) {
    const row = document.createElement("div");
    row.className = "class-row";

    const swatch = document.createElement("span");
    swatch.className = "class-swatch";
    swatch.style.background = classInfo.color;
    swatch.style.color = classInfo.color;

    const meta = document.createElement("div");
    meta.className = "class-meta";

    const label = document.createElement("strong");
    label.textContent = `${classInfo.name} - label ${classInfo.label}`;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = String(Math.round(classInfo.opacity * 100));

    const rgb = hexToRgb(classInfo.color);
    state.classSettings.set(classInfo.label, {
      color: classInfo.color,
      rgb,
      opacity: classInfo.opacity,
    });

    slider.addEventListener("input", () => {
      const settings = state.classSettings.get(classInfo.label);
      settings.opacity = Number(slider.value) / 100;
      renderSlices();
      render3D();
    });

    meta.append(label, slider);
    row.append(swatch, meta);
    elements.classControls.append(row);
  }
}

function build3DPoints() {
  if (!state.volumeData) return;

  const [depth, height, width] = state.dims;
  const [sz, sy, sx] = state.volumeMeta.spacing;
  const target = Number(elements.densitySlider.value);
  const total = depth * height * width;
  const step = Math.max(1, Math.ceil(Math.cbrt(total / target)));
  const physicalX = Math.max(1, width * sx);
  const physicalY = Math.max(1, height * sy);
  const physicalZ = Math.max(1, depth * sz);
  const maxPhysical = Math.max(physicalX, physicalY, physicalZ);
  const range = Math.max(0.00001, state.window.high - state.window.low);

  state.three.points = [];
  state.three.segPoints = new Map();

  for (let z = 0; z < depth; z += step) {
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = indexOf(z, y, x);
        const value = state.volumeData[idx];
        const normalized = clamp((value - state.window.low) / range, 0, 1);

        if (normalized > 0.16) {
          state.three.points.push({
            x: ((x - width / 2) * sx) / maxPhysical,
            y: -((y - height / 2) * sy) / maxPhysical,
            z: ((z - depth / 2) * sz) / maxPhysical,
            v: normalized,
          });
        }

        if (state.segData) {
          const label = state.segData[idx];
          if (label) {
            if (!state.three.segPoints.has(label)) {
              state.three.segPoints.set(label, []);
            }
            state.three.segPoints.get(label).push({
              x: ((x - width / 2) * sx) / maxPhysical,
              y: -((y - height / 2) * sy) / maxPhysical,
              z: ((z - depth / 2) * sz) / maxPhysical,
              label,
            });
          }
        }
      }
    }
  }

  elements.threeStatus.textContent = `${state.three.points.length.toLocaleString()} voxels`;
}

function rotatePoint(point) {
  const { rotX, rotY } = state.three;
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);

  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const y1 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;

  return { x: x1, y: y1, z: z2 };
}

function projectPoint(point, canvas) {
  const rotated = rotatePoint(point);
  const zoom = state.three.zoom;
  const perspective = zoom / (2.15 + rotated.z);
  return {
    x: canvas.width * 0.5 + rotated.x * canvas.width * perspective,
    y: canvas.height * 0.5 + rotated.y * canvas.height * perspective,
    z: rotated.z,
  };
}

function resizeThreeCanvas() {
  const rect = elements.threeCanvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  elements.threeCanvas.width = Math.max(1, Math.floor(rect.width * scale));
  elements.threeCanvas.height = Math.max(1, Math.floor(rect.height * scale));
}

function render3D() {
  resizeThreeCanvas();
  const canvas = elements.threeCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#030407");
  gradient.addColorStop(0.55, "#07121a");
  gradient.addColorStop(1, "#110817");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (const point of state.three.points) {
    const projected = projectPoint(point, canvas);
    const brightness = Math.round(70 + point.v * 150);
    const alpha = 0.035 + point.v * 0.11;
    ctx.fillStyle = `rgba(${brightness}, ${Math.min(255, brightness + 28)}, 255, ${alpha})`;
    ctx.fillRect(projected.x, projected.y, 1.25, 1.25);
  }

  for (const [label, points] of state.three.segPoints.entries()) {
    const settings = state.classSettings.get(label);
    if (!settings || settings.opacity <= 0) continue;

    ctx.fillStyle = `rgba(${settings.rgb.r}, ${settings.rgb.g}, ${settings.rgb.b}, ${settings.opacity})`;
    for (const point of points) {
      const projected = projectPoint(point, canvas);
      ctx.fillRect(projected.x - 1.5, projected.y - 1.5, 3, 3);
    }
  }

  ctx.restore();
}

async function loadVolume() {
  const path = elements.volumePath.value.trim();
  if (!path) {
    setStatus("Enter a DICOM folder or NIfTI path.", true);
    return;
  }

  elements.loadVolumeBtn.disabled = true;
  elements.loadSegBtn.disabled = true;
  setStatus("Reading volume from disk...");

  try {
    const meta = await postJson("/api/load-volume", { path });
    state.volumeMeta = meta;
    state.segMeta = null;
    state.segData = null;
    state.classSettings.clear();
    elements.classControls.className = "empty-state";
    elements.classControls.textContent = "No mask loaded";

    configureControls(meta);
    setStatus("Transferring voxel buffer...");
    const buffer = await fetchArrayBuffer(`/api/volume/${meta.id}/data`);
    state.volumeData = new Float32Array(buffer);

    setStatus(`Loaded ${meta.kind.toUpperCase()} volume`);
    renderSlices();
    build3DPoints();
    render3D();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    elements.loadVolumeBtn.disabled = false;
    if (state.volumeMeta) elements.loadSegBtn.disabled = false;
  }
}

async function loadSegmentation() {
  const path = elements.segPath.value.trim();
  if (!state.volumeMeta) {
    setStatus("Load a volume before loading a segmentation.", true);
    return;
  }
  if (!path) {
    setStatus("Enter a .nii or .nii.gz segmentation path.", true);
    return;
  }

  elements.loadSegBtn.disabled = true;
  setStatus("Reading segmentation mask...");

  try {
    const segMeta = await postJson(`/api/volume/${state.volumeMeta.id}/segmentation`, { path });
    state.segMeta = segMeta;
    makeClassControls(segMeta);

    setStatus("Transferring mask buffer...");
    const buffer = await fetchArrayBuffer(`/api/volume/${state.volumeMeta.id}/segmentation/${segMeta.id}/data`);
    state.segData = new Uint16Array(buffer);

    setStatus(`Loaded mask with ${segMeta.classes.length} classes`);
    renderSlices();
    build3DPoints();
    render3D();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    elements.loadSegBtn.disabled = false;
  }
}

async function loadReport() {
  const path = elements.reportPath.value.trim();
  if (!path) {
    setReportStatus("Enter a report file path.", true);
    return;
  }

  elements.loadReportBtn.disabled = true;
  setReportStatus("Reading report...");

  try {
    const report = await postJson("/api/load-report", { path });
    setReportStatus(`Loaded ${report.type.toUpperCase()} report`);
    renderFindings(report.findings);
    renderReportText(report.text, report.findings);
  } catch (error) {
    setReportStatus(error.message, true);
  } finally {
    elements.loadReportBtn.disabled = false;
  }
}

function wireControls() {
  elements.loadVolumeBtn.addEventListener("click", loadVolume);
  elements.loadSegBtn.addEventListener("click", loadSegmentation);
  elements.loadReportBtn.addEventListener("click", loadReport);

  elements.volumePath.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadVolume();
  });
  elements.segPath.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadSegmentation();
  });
  elements.reportPath.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadReport();
  });

  elements.axialSlider.addEventListener("input", () => {
    state.slices.axial = Number(elements.axialSlider.value);
    renderSlices();
  });
  elements.coronalSlider.addEventListener("input", () => {
    state.slices.coronal = Number(elements.coronalSlider.value);
    renderSlices();
  });
  elements.sagittalSlider.addEventListener("input", () => {
    state.slices.sagittal = Number(elements.sagittalSlider.value);
    renderSlices();
  });

  for (const slider of [elements.windowLow, elements.windowHigh]) {
    slider.addEventListener("input", () => {
      updateWindowFromSliders();
      renderSlices();
      build3DPoints();
      render3D();
    });
  }

  elements.densitySlider.addEventListener("change", () => {
    build3DPoints();
    render3D();
  });

  for (const toggle of elements.flipToggles) {
    const { plane, axis } = toggle.dataset;
    if (state.flips[plane] && axis in state.flips[plane]) {
      state.flips[plane][axis] = toggle.checked;
    }

    toggle.addEventListener("change", () => {
      state.flips[plane][axis] = toggle.checked;
      renderSlices();
    });
  }

  addWheelDepth(elements.axialCanvas, "axial", elements.axialSlider);
  addWheelDepth(elements.coronalCanvas, "coronal", elements.coronalSlider);
  addWheelDepth(elements.sagittalCanvas, "sagittal", elements.sagittalSlider);
  wireThreeCanvas();
  window.addEventListener("resize", () => {
    renderSlices();
    render3D();
  });
}

function addWheelDepth(canvas, plane, slider) {
  canvas.addEventListener("wheel", (event) => {
    if (!state.volumeData) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? 1 : -1;
    const next = clamp(state.slices[plane] + direction, 0, planeMax(plane));
    state.slices[plane] = next;
    slider.value = String(next);
    renderSlices();
  }, { passive: false });
}

function wireThreeCanvas() {
  const canvas = elements.threeCanvas;

  canvas.addEventListener("pointerdown", (event) => {
    state.three.dragging = true;
    state.three.lastX = event.clientX;
    state.three.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.three.dragging) return;
    const dx = event.clientX - state.three.lastX;
    const dy = event.clientY - state.three.lastY;
    state.three.lastX = event.clientX;
    state.three.lastY = event.clientY;
    state.three.rotY += dx * 0.009;
    state.three.rotX += dy * 0.009;
    render3D();
  });

  canvas.addEventListener("pointerup", (event) => {
    state.three.dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    state.three.zoom = clamp(state.three.zoom * factor, 0.45, 4);
    render3D();
  }, { passive: false });
}

wireControls();
render3D();
