console.log("Atlas loaded");

const canvas = document.getElementById("canvas");
const world = document.getElementById("world");
const selectionBox = document.getElementById("selection-box");
const dropOverlay = document.getElementById("drop-overlay");

if (!canvas || !world || !selectionBox || !dropOverlay) {
  throw new Error("Atlas elements not found.");
}

const objects = [];

let selectedObjects = [];

let zoom = 1;

let panX = 0;
let panY = 0;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const GRID_SIZE = 10;

let mode = "none";

let activeResizeHandle = null;

let startMouseX = 0;
let startMouseY = 0;

let startPanX = 0;
let startPanY = 0;

let dragStartState = null;
let groupStartBounds = null;
let groupStartAngle = 0;
let groupRotation = 0;
let groupRotationStart = 0;

const resizeHandleDirs = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },

  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 },

  ne: { x: 1, y: -1 },
  nw: { x: -1, y: -1 },

  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
};

const resizeCursors = {
  n: "ns-resize",
  s: "ns-resize",

  e: "ew-resize",
  w: "ew-resize",

  ne: "nesw-resize",
  sw: "nesw-resize",

  nw: "nwse-resize",
  se: "nwse-resize",
};

Object.keys(resizeHandleDirs).forEach((type) => {
  const handle = document.createElement("div");

  handle.className = `handle handle-${type}`;

  handle.style.cursor = resizeCursors[type];

  handle.addEventListener("mousedown", (event) => {
    startResize(event, type);
  });

  selectionBox.appendChild(handle);
});

const rotateStem = document.createElement("div");

rotateStem.className = "rotate-stem";

const rotateHandle = document.createElement("div");

rotateHandle.className = "handle handle-rotate";

rotateHandle.addEventListener("mousedown", startRotate);

selectionBox.appendChild(rotateStem);
selectionBox.appendChild(rotateHandle);

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: (clientX - rect.left - panX) / zoom,

    y: (clientY - rect.top - panY) / zoom,
  };
}

function worldToScreen(x, y) {
  return {
    x: panX + x * zoom,

    y: panY + y * zoom,
  };
}

function updateWorldTransform() {
  world.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;

  updateSelectionBox();
}

function updateObject(object) {
  object.element.style.width = `${object.width}px`;

  object.element.style.height = `${object.height}px`;

  object.element.style.left = `${object.x - object.width / 2}px`;

  object.element.style.top = `${object.y - object.height / 2}px`;

  object.element.style.transform = `rotate(${object.rotation}deg)`;
}

function normalizeAngle(deg) {
  let a = deg % 360;

  if (a > 180) a -= 360;
  if (a < -180) a += 360;

  return a;
}

function computeGroupRotation(objs) {
  if (!objs.length) {
    return 0;
  }

  const first = objs[0].rotation;

  const allSame = objs.every(
    (o) => Math.abs(normalizeAngle(o.rotation - first)) < 0.01,
  );

  return allSame ? first : 0;
}

function selectObject(object, additive = false) {
  if (!additive) {
    selectedObjects = [object];
  } else {
    const index = selectedObjects.indexOf(object);

    if (index === -1) {
      selectedObjects.push(object);
    } else {
      selectedObjects.splice(index, 1);
    }
  }

  groupRotation = computeGroupRotation(selectedObjects);

  updateSelectionBox();
}

function deselect() {
  selectedObjects = [];

  groupRotation = 0;

  selectionBox.style.display = "none";
}

function getSelectionBounds() {
  if (!selectedObjects.length) {
    return null;
  }

  const rotation =
    selectedObjects.length === 1 ? selectedObjects[0].rotation : groupRotation;

  const toLocal = toRad(-rotation);
  const cosToLocal = Math.cos(toLocal);
  const sinToLocal = Math.sin(toLocal);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  selectedObjects.forEach((object) => {
    const localX = object.x * cosToLocal - object.y * sinToLocal;
    const localY = object.x * sinToLocal + object.y * cosToLocal;

    minX = Math.min(minX, localX - object.width / 2);

    minY = Math.min(minY, localY - object.height / 2);

    maxX = Math.max(maxX, localX + object.width / 2);

    maxY = Math.max(maxY, localY + object.height / 2);
  });

  const localCenterX = (minX + maxX) / 2;
  const localCenterY = (minY + maxY) / 2;

  const toWorld = toRad(rotation);
  const cosToWorld = Math.cos(toWorld);
  const sinToWorld = Math.sin(toWorld);

  const centerX = localCenterX * cosToWorld - localCenterY * sinToWorld;
  const centerY = localCenterX * sinToWorld + localCenterY * cosToWorld;

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    width,
    height,
    centerX,
    centerY,
    rotation,
  };
}

function updateSelectionBox() {
  const bounds = getSelectionBounds();

  if (!bounds) {
    selectionBox.style.display = "none";
    return;
  }

  selectionBox.style.display = "block";

  const topLeft = worldToScreen(bounds.left, bounds.top);

  selectionBox.style.left = `${topLeft.x}px`;

  selectionBox.style.top = `${topLeft.y}px`;

  selectionBox.style.width = `${bounds.width * zoom}px`;

  selectionBox.style.height = `${bounds.height * zoom}px`;

  selectionBox.style.transform = `rotate(${bounds.rotation}deg)`;
}

function snapToGrid(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}
function bringToFront(object) {
  const index = objects.indexOf(object);

  if (index === -1) {
    return;
  }

  objects.splice(index, 1);

  objects.push(object);

  objects.forEach((item, i) => {
    item.element.style.zIndex = i + 1;
  });
}

function createImage(file, x, y) {
  const image = document.createElement("img");

  const url = URL.createObjectURL(file);

  image.className = "image-object";

  image.draggable = false;

  image.onload = () => {
    const maxSize = 500;

    let width = image.naturalWidth;

    let height = image.naturalHeight;

    if (Math.max(width, height) > maxSize) {
      const scale = maxSize / Math.max(width, height);

      width *= scale;
      height *= scale;
    }

    const object = {
      element: image,

      x: x,

      y: y,

      width: width,

      height: height,

      rotation: 0,
    };

    objects.push(object);

    world.appendChild(image);

    image.addEventListener("mousedown", (event) => {
      startObjectDrag(event, object);
    });

    updateObject(object);

    bringToFront(object);

    selectObject(object);

    saveImages();

    URL.revokeObjectURL(url);
  };

  image.src = url;
}

function saveImages() {
  const savedImages = [];

  objects.forEach((object) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = object.element.naturalWidth;
    canvas.height = object.element.naturalHeight;

    ctx.drawImage(object.element, 0, 0);

    savedImages.push({
      image: canvas.toDataURL("image/png"),
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      rotation: object.rotation,
    });
  });

  localStorage.setItem("atlas-images", JSON.stringify(savedImages));
}

function loadimages() {
  const savedImages = JSON.parse(localStorage.getItem("atlas-images")) || [];

  savedImages.forEach((saved) => {
    const image = new Image();

    image.onload = () => {
      const object = {
        element: image,
        x: saved.x,
        y: saved.y,
        width: saved.width,
        height: saved.height,
        rotation: saved.rotation,
      };

      image.className = "image-object";
      image.draggable = false;

      objects.push(object);
      world.appendChild(image);

      image.addEventListener("mousedown", (event) => {
        startObjectDrag(event, object);
      });

      updateObject(object);
      bringToFront(object);
    };
    image.src = saved.image;
  });
}
window.addEventListener("paste", (event) => {
  const items = event.clipboardData.items;

  for (const item of items) {
    if (!item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();

    if (!file) {
      continue;
    }

    const point = screenToWorld(
      canvas.clientWidth / 2,
      canvas.clientHeight / 2,
    );

    createImage(file, point.x, point.y);

    break;
  }
});

function startObjectDrag(event, object) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();

  event.stopPropagation();

  if (event.shiftKey) {
    selectObject(object, true);
  } else if (!selectedObjects.includes(object)) {
    selectObject(object);
  }

  bringToFront(object);

  mode = "drag";

  startMouseX = event.clientX;

  startMouseY = event.clientY;

  dragStartState = selectedObjects.map((object) => ({
    object: object,
    x: object.x,
    y: object.y,
  }));
  groupStartBounds = getSelectionBounds();
}

function startResize(event, type) {
  if (!selectedObjects.length || event.button !== 0) {
    return;
  }

  event.preventDefault();

  event.stopPropagation();

  mode = "resize";

  activeResizeHandle = type;

  startMouseX = event.clientX;
  startMouseY = event.clientY;

  groupStartBounds = getSelectionBounds();

  dragStartState = selectedObjects.map((object) => ({
    object: object,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
  }));
}

function resizeObject(event) {
  if (!selectedObjects.length || !dragStartState || !groupStartBounds) {
    return;
  }

  const dir = resizeHandleDirs[activeResizeHandle];

  if (!dir) {
    return;
  }

  const dx = (event.clientX - startMouseX) / zoom;

  const dy = (event.clientY - startMouseY) / zoom;

  const rotation = toRad(groupStartBounds.rotation);

  const localX = dx * Math.cos(rotation) + dy * Math.sin(rotation);

  const localY = -dx * Math.sin(rotation) + dy * Math.cos(rotation);

  let scale = 1;

  if (dir.x !== 0 && dir.y !== 0) {
    const widthScale =
      (groupStartBounds.width + dir.x * localX) / groupStartBounds.width;

    const heightScale =
      (groupStartBounds.height + dir.y * localY) / groupStartBounds.height;

    scale =
      Math.abs(widthScale - 1) > Math.abs(heightScale - 1)
        ? widthScale
        : heightScale;
  } else if (dir.x !== 0) {
    scale = (groupStartBounds.width + dir.x * localX) / groupStartBounds.width;
  } else {
    scale =
      (groupStartBounds.height + dir.y * localY) / groupStartBounds.height;
  }

  scale = Math.max(scale, 0.05);

  const newWidth = groupStartBounds.width * scale;

  const newHeight = groupStartBounds.height * scale;

  const anchorX =
    groupStartBounds.centerX - (dir.x * groupStartBounds.width) / 2;

  const anchorY =
    groupStartBounds.centerY - (dir.y * groupStartBounds.height) / 2;

  const newCenterX = anchorX + (dir.x * newWidth) / 2;

  const newCenterY = anchorY + (dir.y * newHeight) / 2;

  selectedObjects.forEach((object, index) => {
    const start = dragStartState[index];

    const offsetX = start.x - groupStartBounds.centerX;

    const offsetY = start.y - groupStartBounds.centerY;

    object.x = newCenterX + offsetX * scale;

    object.y = newCenterY + offsetY * scale;

    object.width = start.width * scale;

    object.height = start.height * scale;

    updateObject(object);
  });

  updateSelectionBox();
}

function startRotate(event) {
  if (!selectedObjects.length || event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  mode = "rotate";

  const bounds = getSelectionBounds();

  groupStartBounds = bounds;

  groupRotationStart = bounds.rotation;

  const rect = canvas.getBoundingClientRect();

  const center = worldToScreen(bounds.centerX, bounds.centerY);

  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  groupStartAngle = Math.atan2(mouseY - center.y, mouseX - center.x);

  dragStartState = selectedObjects.map((object) => ({
    object: object,
    x: object.x,
    y: object.y,
    rotation: object.rotation,
  }));
}
function rotateObject(event) {
  if (!selectedObjects.length || !dragStartState) {
    return;
  }

  const rect = canvas.getBoundingClientRect();

  const center = worldToScreen(
    groupStartBounds.centerX,
    groupStartBounds.centerY,
  );

  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  let angle = Math.atan2(mouseY - center.y, mouseX - center.x);

  let startAngle = groupStartAngle;

  let rotation = ((angle - startAngle) * 180) / Math.PI;

  if (event.shiftKey) {
    rotation = Math.round(rotation / 15) * 15;
  }

  groupRotation = normalizeAngle(groupRotationStart + rotation);

  const radians = toRad(rotation);

  selectedObjects.forEach((object, index) => {
    const start = dragStartState[index];

    const x = start.x - groupStartBounds.centerX;

    const y = start.y - groupStartBounds.centerY;

    object.x =
      groupStartBounds.centerX + x * Math.cos(radians) - y * Math.sin(radians);

    object.y =
      groupStartBounds.centerY + x * Math.sin(radians) + y * Math.cos(radians);

    object.rotation = start.rotation + rotation;
    updateObject(object);
  });
  updateSelectionBox();
}

canvas.addEventListener("mousedown", (event) => {
  if (event.button === 1) {
    event.preventDefault();

    mode = "pan";

    startPanX = panX;

    startPanY = panY;

    startMouseX = event.clientX;

    startMouseY = event.clientY;

    return;
  }

  if (event.button === 0) {
    const point = screenToWorld(event.clientX, event.clientY);

    let clickedObject = null;

    for (let i = objects.length - 1; i >= 0; i--) {
      const object = objects[i];

      const angle = toRad(-object.rotation);

      const dx = point.x - object.x;

      const dy = point.y - object.y;

      const localX = dx * Math.cos(angle) - dy * Math.sin(angle);

      const localY = dx * Math.sin(angle) + dy * Math.cos(angle);

      if (
        Math.abs(localX) <= object.width / 2 &&
        Math.abs(localY) <= object.height / 2
      ) {
        clickedObject = object;

        break;
      }
    }

    if (!clickedObject) {
      deselect();
    }
  }
});

window.addEventListener("mousemove", (event) => {
  if (mode === "pan") {
    panX = startPanX + event.clientX - startMouseX;

    panY = startPanY + event.clientY - startMouseY;

    updateWorldTransform();

    return;
  }

  if (!selectedObjects.length || !dragStartState) {
    return;
  }

  if (mode === "drag") {
    let moveX = (event.clientX - startMouseX) / zoom;

    let moveY = (event.clientY - startMouseY) / zoom;

    if (!event.altKey && groupStartBounds) {
      const targetX = groupStartBounds.centerX + moveX;

      const targetY = groupStartBounds.centerY + moveY;

      moveX = snapToGrid(targetX) - groupStartBounds.centerX;

      moveY = snapToGrid(targetY) - groupStartBounds.centerY;
    }

    dragStartState.forEach((state) => {
      state.object.x = state.x + moveX;

      state.object.y = state.y + moveY;

      updateObject(state.object);
    });

    saveImages();

    updateSelectionBox();
  }

  if (mode === "resize") {
    resizeObject(event);
    saveImages();
  }

  if (mode === "rotate") {
    rotateObject(event);
    saveImages();
  }
});

window.addEventListener("mouseup", () => {
  if (mode !== "none") {
    saveImages();
  }

  mode = "none";

  activeResizeHandle = null;

  dragStartState = null;
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();

    const rect = canvas.getBoundingClientRect();

    const mouseX = event.clientX - rect.left;

    const mouseY = event.clientY - rect.top;

    const previousZoom = zoom;

    zoom *= Math.exp(-event.deltaY * 0.0015);

    zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);

    panX = mouseX - (mouseX - panX) * (zoom / previousZoom);

    panY = mouseY - (mouseY - panY) * (zoom / previousZoom);

    updateWorldTransform();
  },
  {
    passive: false,
  },
);

function isImageFile(file) {
  return file && file.type.startsWith("image/");
}

canvas.addEventListener("dragover", (event) => {
  event.preventDefault();

  const hasImage = [...event.dataTransfer.items].some(
    (item) => item.kind === "file" && item.type.startsWith("image/"),
  );

  if (!hasImage) {
    return;
  }

  event.dataTransfer.dropEffect = "copy";

  dropOverlay.style.display = "flex";
});

canvas.addEventListener("dragleave", () => {
  dropOverlay.style.display = "none";
});

canvas.addEventListener("drop", (event) => {
  event.preventDefault();

  dropOverlay.style.display = "none";

  const files = [...event.dataTransfer.files].filter(isImageFile);

  if (!files.length) {
    return;
  }

  const point = screenToWorld(event.clientX, event.clientY);

  files.forEach((file, index) => {
    createImage(
      file,

      point.x + index * 30,

      point.y + index * 30,
    );
  });
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
});

window.addEventListener("drop", (event) => {
  if (!canvas.contains(event.target)) {
    event.preventDefault();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    deselect();
  }

  if (
    (event.key === "Delete" || event.key === "Backspace") &&
    selectedObjects.length
  ) {
    selectedObjects.forEach((object) => {
      object.element.remove();

      const index = objects.indexOf(object);

      if (index !== -1) {
        objects.splice(index, 1);
      }
    });
    saveImages();

    deselect();
  }
});

loadimages();
updateWorldTransform();
