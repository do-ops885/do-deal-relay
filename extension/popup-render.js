function updatePageInfo(elements, tab) {
  elements.pageTitle.textContent = tab.title || "Unknown";
  try {
    elements.pageUrl.textContent = new URL(tab.url).hostname;
  } catch {
    elements.pageUrl.textContent = "Invalid URL";
  }
  let faviconSet = false;
  if (tab.favIconUrl) {
    try {
      const faviconUrl = new URL(tab.favIconUrl);
      if (faviconUrl.protocol === "http:" || faviconUrl.protocol === "https:") {
        const img = document.createElement("img");
        img.src = faviconUrl.href;
        img.width = img.height = 32;
        img.style.borderRadius = "6px";
        img.alt = "";
        elements.favicon.textContent = "";
        elements.favicon.appendChild(img);
        faviconSet = true;
      }
    } catch {}
  }
  if (!faviconSet) elements.favicon.textContent = "🌐";
}

function showDetections(state, elements, detections) {
  elements.detectionsSection.style.display = "block";
  updateScanStatus(
    elements,
    "found",
    `${detections.length} referral code${detections.length > 1 ? "s" : ""} found`,
  );
  elements.detectionList.textContent = "";

  detections.forEach((d, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "detection-item";
    item.dataset.index = i.toString();
    item.setAttribute("aria-pressed", i === 0 ? "true" : "false");

    const info = document.createElement("div");
    info.className = "detection-info";

    const codeValue = document.createElement("span");
    codeValue.className = "code-value";
    codeValue.textContent = d.code;

    const codeSource = document.createElement("span");
    codeSource.className = "code-source";
    codeSource.textContent = d.source.replaceAll("_", " ");

    info.appendChild(codeValue);
    info.appendChild(codeSource);

    const confidence = document.createElement("span");
    confidence.className = "confidence";
    confidence.textContent = `${Math.round(d.confidence * 100)}%`;

    item.appendChild(info);
    item.appendChild(confidence);

    item.addEventListener("click", () => {
      elements.detectionList
        .querySelectorAll(".detection-item")
        .forEach((el) => {
          el.classList.remove("selected");
          el.setAttribute("aria-pressed", "false");
        });
      item.classList.add("selected");
      item.setAttribute("aria-pressed", "true");
      state.selectedDetection = state.detections[parseInt(item.dataset.index)];
    });

    elements.detectionList.appendChild(item);
  });

  if (detections.length > 0) {
    const firstItem = elements.detectionList.querySelector(".detection-item");
    if (firstItem) {
      firstItem.classList.add("selected");
      firstItem.setAttribute("aria-pressed", "true");
      state.selectedDetection = detections[0];
      elements.captureBtn.focus();
    }
  }
}

function showNoDetections(elements) {
  elements.detectionsSection.style.display = "none";
  updateScanStatus(elements, "none", "No referral codes detected on this page");
  elements.manualCode.focus();
}

function updateScanStatus(elements, status, text) {
  const indClass =
    status === "found" ? "found" : status === "scanning" ? "scanning" : "none";
  elements.scanStatus.textContent = "";
  const indicator = document.createElement("div");
  indicator.className = `status-indicator ${indClass}`;
  const statusText = document.createElement("span");
  statusText.className = "status-text";
  statusText.textContent = text;
  elements.scanStatus.appendChild(indicator);
  elements.scanStatus.appendChild(statusText);
}

function showToast(elements, message, type = "") {
  elements.toast.textContent = message;
  elements.toast.className = `toast ${type} show`;
  setTimeout(() => elements.toast.classList.remove("show"), 3000);
}

async function copyToClipboard(elements, text, buttonElement) {
  if (!text || buttonElement.dataset.copying === "true") return;

  const originalLabel = buttonElement.getAttribute("aria-label");
  const originalTitle = buttonElement.getAttribute("title");

  try {
    buttonElement.dataset.copying = "true";
    await navigator.clipboard.writeText(text);
    showToast(elements, "Copied to clipboard!", "success");

    const children = Array.from(buttonElement.children);
    buttonElement.textContent = "";
    const span = document.createElement("span");
    span.setAttribute("aria-hidden", "true");
    span.textContent = "✅";
    buttonElement.appendChild(span);

    buttonElement.setAttribute("aria-label", "Copied!");
    buttonElement.setAttribute("title", "Copied!");

    setTimeout(() => {
      buttonElement.textContent = "";
      children.forEach((child) => buttonElement.appendChild(child));
      originalLabel
        ? buttonElement.setAttribute("aria-label", originalLabel)
        : buttonElement.removeAttribute("aria-label");
      originalTitle
        ? buttonElement.setAttribute("title", originalTitle)
        : buttonElement.removeAttribute("title");
      buttonElement.removeAttribute("data-copying");
    }, 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
    showToast(elements, "Failed to copy", "error");
    buttonElement.removeAttribute("data-copying");
  }
}
