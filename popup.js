let button = document.getElementById("changeColor");

button.addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.storage.sync.get(["mode"], function (result) {
    const mode = result.mode;
    const toggledMode = mode === "on" ? "off" : "on";
    button.innerHTML = `Turn it ${mode}`;
    chrome.storage.sync.set({ mode: toggledMode }, function () {
      chrome.runtime.sendMessage(
        { tabId: tab.id, tabUrl: tab.url, mode: toggledMode },
        function (response) {}
      );
    });
  });
});

function getURL() {}
