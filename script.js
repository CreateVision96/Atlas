console.log("Atlas loaded");

const canvas = document.getElementById("canvas");
const world = document.getElementById("world");
const selectionBox = document.getElementById("selection-box");
const dropOverlay = document.getElementById("drop-overlay");

if (!canvas || !world || !selectionBox || !dropOverlay) {
  throw new Error("Atlas elements not found.");
}

const objects = [];

let selectedObject = [];

let zoom = 1;

let panX = 0;
let panY = 0;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

let mode = "none";

let activeResizeHandle = null;

let startMouseX = 0;
let startMouseY = 0;

let startPanX = 0;
let startPanY = 0;

let dragStartState = null;

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

function selectObject(object) {
  selectedObject = object;

  selectionBox.style.display = "block";

  updateSelectionBox();
}

function deselect() {
  selectedObject = null;

  selectionBox.style.display = "none";
}

function updateSelectionBox() {
  if (!selectedObject) {
    return;
  }

  const object = selectedObject;

  const topLeft = worldToScreen(
    object.x - object.width / 2,
    object.y - object.height / 2,
  );

  selectionBox.style.left = `${topLeft.x}px`;

  selectionBox.style.top = `${topLeft.y}px`;

  selectionBox.style.width = `${object.width * zoom}px`;

  selectionBox.style.height = `${object.height * zoom}px`;

  selectionBox.style.transform = `rotate(${object.rotation}deg)`;
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

      aspectRatio: width / height,
    };

    objects.push(object);

    world.appendChild(image);

    image.addEventListener("mousedown", (event) => {
      startObjectDrag(event, object);
    });

    updateObject(object);

    bringToFront(object);

    selectObject(object);

    URL.revokeObjectURL(url);
  };

  image.src = url;
}

function startObjectDrag(event, object) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();

  event.stopPropagation();

  selectObject(object);

  bringToFront(object);

  mode = "drag";

  startMouseX = event.clientX;

  startMouseY = event.clientY;

  dragStartState = {
    x: object.x,

    y: object.y,

    width: object.width,

    height: object.height,

    rotation: object.rotation,
  };
}

function startResize(event, type) {
  if (!selectedObject || event.button !== 0) {
    return;
  }

  event.preventDefault();

  event.stopPropagation();

  mode = "resize";

  activeResizeHandle = type;

  startMouseX = event.clientX;

  startMouseY = event.clientY;

  dragStartState = {
    x: selectedObject.x,

    y: selectedObject.y,

    width: selectedObject.width,

    height: selectedObject.height,

    rotation: selectedObject.rotation,
  };
}

function resizeObject(event) {
  const object = selectedObject;

  const start = dragStartState;

  const dir = resizeHandleDirs[activeResizeHandle];

  if (!object || !start || !dir) {
    return;
  }

  const dx = (event.clientX - startMouseX) / zoom;

  const dy = (event.clientY - startMouseY) / zoom;

  const rotation = toRad(start.rotation);

  const localDx = dx * Math.cos(rotation) + dy * Math.sin(rotation);

  const localDy = -dx * Math.sin(rotation) + dy * Math.cos(rotation);

  let scale;

  if (dir.x !== 0 && dir.y !== 0) {
    const widthScale = (start.width + dir.x * localDx) / start.width;

    const heightScale = (start.height + dir.y * localDy) / start.height;

    scale =
      Math.abs(widthScale - 1) > Math.abs(heightScale - 1)
        ? widthScale
        : heightScale;
  } else if (dir.x !== 0) {
    scale = (start.width + dir.x * localDx) / start.width;
  } else {
    scale = (start.height + dir.y * localDy) / start.height;
  }

  const minScale = 20 / Math.min(start.width, start.height);

  scale = Math.max(scale, minScale);

  const newWidth = start.width * scale;

  const newHeight = start.height * scale;

  const anchorX = (-dir.x * start.width) / 2;

  const anchorY = (-dir.y * start.height) / 2;

  const anchorWorldX =
    start.x + anchorX * Math.cos(rotation) - anchorY * Math.sin(rotation);

  const anchorWorldY =
    start.y + anchorX * Math.sin(rotation) + anchorY * Math.cos(rotation);

  const newAnchorX = (-dir.x * newWidth) / 2;

  const newAnchorY = (-dir.y * newHeight) / 2;

  object.width = newWidth;

  object.height = newHeight;

  object.x =
    anchorWorldX -
    (newAnchorX * Math.cos(rotation) - newAnchorY * Math.sin(rotation));

  object.y =
    anchorWorldY -
    (newAnchorX * Math.sin(rotation) + newAnchorY * Math.cos(rotation));

  updateObject(object);

  updateSelectionBox();
}

function startRotate(event) {
  if (!selectedObject || event.button !== 0) {
    return;
  }

  event.preventDefault();

  event.stopPropagation();

  mode = "rotate";

  startMouseX = event.clientX;

  startMouseY = event.clientY;

  dragStartState = {
    x: selectedObject.x,

    y: selectedObject.y,

    width: selectedObject.width,

    height: selectedObject.height,

    rotation: selectedObject.rotation,
  };
}

function rotateObject(event) {
  const object = selectedObject;

  if (!object) {
    return;
  }

  const rect = canvas.getBoundingClientRect();

  const center = worldToScreen(object.x, object.y);

  const mouseX = event.clientX - rect.left;

  const mouseY = event.clientY - rect.top;

  let angle =
    (Math.atan2(mouseY - center.y, mouseX - center.x) * 180) / Math.PI;

  angle += 90;

  if (event.shiftKey) {
    angle = Math.round(angle / 15) * 15;
  }

  object.rotation = angle;

  updateObject(object);

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

  if (!selectedObject || !dragStartState) {
    return;
  }

  if (mode === "drag") {
    const moveX = (event.clientX - startMouseX) / zoom;

    const moveY = (event.clientY - startMouseY) / zoom;

    selectedObject.x = dragStartState.x + moveX;

    selectedObject.y = dragStartState.y + moveY;

    updateObject(selectedObject);

    updateSelectionBox();
  }

  if (mode === "resize") {
    resizeObject(event);
  }

  if (mode === "rotate") {
    rotateObject(event);
  }
});

window.addEventListener("mouseup", () => {
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

  if (event.key === "Delete" && selectedObject) {
    const index = objects.indexOf(selectedObject);

    if (index !== -1) {
      selectedObject.element.remove();

      objects.splice(index, 1);
    }

    deselect();
  }
});

updateWorldTransform();
