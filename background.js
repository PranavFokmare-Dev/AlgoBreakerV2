const analyticsEnum = {
  NoTabSet: -1,
  newTabUrl: "chrome://newtab/",
  emptyUrl: "EMPTY_URL",
  historyRemoverAlarmName: "historyWeeklyRemover",
};
const webPage = {
  homePage: "#primary > ytd-rich-grid-renderer",
  videoPlayerEndScreen:
    "#movie_player > div.html5-endscreen.ytp-player-content.videowall-endscreen.ytp-show-tiles",
  videoPlayerSideContent: "#items > ytd-item-section-renderer",
  search: "#page-manager > ytd-search",
  playlistSideContent: "#items > ytd-item-section-renderer",
  videoPlayerSideContent2: "#secondary",
};

let currentWindowId = -1;
let windowSessions = {
  //windowId -> {
  // currentTabId : 1
  // tabsessions : {
  //    url: '',
  //    startTime: number date.now(),
  //  }
  //}
};

chrome.runtime.onInstalled.addListener(async () => {
  chrome.storage.sync.set({ mode: "on" }, function () {});
  console.log("runtime on installed");
  await setInStorage({ mode: "on" });
  await saveHistory({});
  const weekDurationInMins = 7 * 24 * 60;
  chrome.alarms.create(analyticsEnum.historyRemoverAlarmName, {
    periodInMinutes: weekDurationInMins,
  });
});

//Button click -> on/off call
chrome.runtime.onMessage.addListener(async function (
  request,
  sender,
  sendResponse
) {
  AlgoBreakerMain(request.mode, request.tabId, request.tabUrl);

  console.log("SUMMARY");
  console.log(currentWindowId);
  console.log(windowSessions);
  console.log(await getHistory());
});

//Change in URL|tab created changed url
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  chrome.storage.sync.get(["mode"], function (result) {
    const mode = result.mode;
    AlgoBreakerMain(mode, tab.id, tab.url);
  });
});

function AlgoBreakerMain(mode, tabId, url) {
  if (mode === "on") AlgoBreakerOn(url, tabId);
  else AlgoBreakerOff(tabId);
}

function AlgoBreakerOn(url, tabId) {
  const hideCss = `${webPage.homePage}{visibility:hidden}
${webPage.videoPlayerEndScreen}{visibility:hidden}
${webPage.videoPlayerSideContent}{visibility:hidden}
${webPage.playlistSideContent}{visibility:hidden}
${webPage.videoPlayerSideContent2}{visibility:hidden}
${webPage.amazonPrimeAutoPlay2}{visibility:hidden}
`;
  // adding if url starts with
  // adding show css if the url doesnt starts with
  chrome.scripting.insertCSS(
    {
      target: { tabId: tabId },
      css: hideCss,
    },
    () => {}
  );
}

function AlgoBreakerOff(tabId) {
  const showCss = `${webPage.homePage}{visibility:visible}
  ${webPage.videoPlayerEndScreen}{visibility:visible}
  ${webPage.videoPlayerSideContent}{visibility:visible}
  ${webPage.playlistSideContent}{visibility:visible}
  ${webPage.videoPlayerSideContent2}{visibility:visible}
  ${webPage.amazonPrimeAutoPlay2}{visibility:visible}
  `;
  chrome.scripting.insertCSS(
    {
      target: { tabId: tabId },
      css: showCss,
    },
    () => {}
  );
}

//Analytics code
chrome.windows.onFocusChanged.addListener(async function (newWindowId) {
  console.log("window focus changed" + newWindowId);
  if (isBrowserNotInFocus(newWindowId) && windowSessionExists(newWindowId)) {
    await endSession(windowSessions[newWindowId].currentTabId, newWindowId);
  } else if (isExistingBrowserWindow(newWindowId)) {
    startSessionForActiveTabIn(newWindowId);
    if (isExistingBrowserWindow(currentWindowId)) {
      await endSession(getActiveTabInWindow(currentWindowId), currentWindowId);
    }
    if (newWindowId != -1) {
      currentWindowId = newWindowId;
      console.log("CURRENT WINDOW ID Changed to ", currentWindowId);
    }
  } else {
    if (newWindowId != -1) {
      currentWindowId = newWindowId;
      console.log("CURRENT WINDOW ID Changed to ", currentWindowId);
    }
  }
  function isBrowserNotInFocus(windowId) {
    return windowId == -1;
  }
  function windowSessionExists(windowId) {
    return windowSessions[windowId] !== undefined;
  }
  function isExistingBrowserWindow(newWindowId) {
    return windowSessions[newWindowId] !== undefined;
  }
  function startSessionForActiveTabIn(windowId) {
    let windowSession = windowSessions[windowId];
    const activeTabId = windowSession.currentTabId;
    const tabSessions = windowSession.tabSessions;
    tabSessions[activeTabId].startTime = Date.now();
    console.log(
      `In the window ID ${windowId} for tab ${activeTabId} for Url ${tabSessions[activeTabId].url} started the session`
    );
  }
  function getActiveTabInWindow(windowId) {
    const windowSession = windowSessions[windowId];
    return windowSession.currentTabId;
  }
});
async function endSession(tabId, windowId) {
  let tabSessions = windowSessions[windowId].tabSessions;
  const session = tabSessions[tabId];
  const timeSpent = getTimeSpent(session);
  await updateHistory();
  session.startTime = 0;

  function getTimeSpent(session) {
    if (session.startTime === 0) return 0;
    return Date.now() - session.startTime;
  }
  async function updateHistory() {
    let history = await getHistory();
    if (history[session.url] === undefined) {
      history[session.url] = 0;
    }
    history[session.url] += Math.max(timeSpent, 0);
    await saveHistory(history);
  }
}
chrome.tabs.onActivated.addListener(async function (activeInfo) {
  console.log("Active" + activeInfo.tabId);
  let tabId = activeInfo.tabId;
  let windowId = activeInfo.windowId;
  let windowSession = getOrCreateWindowSession(windowId);
  let currentTabId = windowSession.currentTabId;
  currentWindowId = windowId;
  const tabSessions = windowSession.tabSessions;

  await endOldSession(currentTabId, windowId);
  currentTabId = tabId;
  windowSession.currentTabId = tabId;
  const isOldTab = tabSessions[tabId] !== undefined;
  if (isOldTab) {
    tabSessions[tabId].startTime = Date.now();
  } else {
    tabSessions[tabId] = {
      url: analyticsEnum.emptyUrl,
      startTime: 0,
      endTime: 0,
    };
  }

  async function endOldSession(currentTabId, windowId) {
    if (currentTabId !== analyticsEnum.NoTabSet) {
      await endSession(currentTabId, windowId);
    }
  }
});

function getOrCreateWindowSession(windowId) {
  if (windowSessions[windowId] === undefined) {
    windowSessions[windowId] = {
      currentTabId: -1,
      tabSessions: {},
    };
  }
  return windowSessions[windowId];
}

chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  const notUpdatedToNewTab = tab.url != analyticsEnum.newTabUrl;

  console.log("update" + tabId);
  let windowId = tab.windowId;
  let window = getOrCreateWindowSession(windowId);
  let tabSessions = window.tabSessions;
  let currentTabId = window.currentTabId;

  if (notUpdatedToNewTab) {
    await handleTabLoadedEvent();
  }

  async function handleTabLoadedEvent() {
    const tabExists = tabSessions[tabId] !== undefined;
    if (tabExists) {
      const isLinkUpdatedFromNewTab =
        tabSessions[tabId].url === analyticsEnum.emptyUrl;
      if (isLinkUpdatedFromNewTab) {
        initializeSession();
      } else {
        //In current tab user changed the link
        await updateSessionToNewLink();
      }
    } else {
      //middle click
      initalizeInactiveSession();
    }
  }

  function initializeSession() {
    tabSessions[tabId].url = getHostName(tab.url);
    tabSessions[tabId].startTime = Date.now();
  }

  async function updateSessionToNewLink() {
    if (tabId === currentTabId) {
      await endSession(tabId, windowId);
      tabSessions[tabId] = {
        url: getHostName(tab.url),
        startTime: Date.now(),
        endTime: 0,
      };
    }
  }

  function initalizeInactiveSession() {
    console.log("middle click");
    console.log(tab);
    tabSessions[tabId] = {
      url: getHostName(tab.url),
      startTime: 0,
      endTime: 0,
    };
  }
});
async function endTabSession(tabId) {
  const session = tabSessions[tabId];
  const timeSpent = Date.now() - session.startTime;
  await updateHistory();
  session.startTime = 0;

  async function updateHistory() {
    let history = await getHistory();
    if (history[session.url] === undefined) {
      history[session.url] = 0;
    }
    history[session.url] += Math.max(timeSpent, 0);
    await saveHistory(history);
  }
}

chrome.tabs.onRemoved.addListener(async function (closingTabID, removedInfo) {
  console.log("closed" + closingTabID);
  const windowId = removedInfo.windowId;
  const window = windowSessions[windowId];
  if (window != undefined) {
    const tabSessions = window.tabSessions;
    let currentTabId = window.currentTabId;

    const tabExists = tabSessions[closingTabID] !== undefined;
    if (tabExists) {
      if (closingCurrentTab(closingTabID, currentTabId))
        await endSession(closingTabID, windowId);
      delete tabSessions[closingTabID];
    }
  }

  function closingCurrentTab(closingTabID, currentTabId) {
    return closingTabID === currentTabId;
  }
});

async function getHistory() {
  let history = await getFromStorage("history");
  return history === undefined ? {} : history;
}

async function saveHistory(history) {
  await setInStorage({ history: history });
}

function getFromStorage(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get([key], function (result) {
      const value = result[key];
      if (chrome.runtime.lastError) {
        console.log("error occured" + chrome.runtime.error);
      } else {
        resolve(value);
      }
    });
  });
}

function setInStorage(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(data, function () {
      resolve();
    });
  });
}

function getTabInfo(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, function (tab) {
      resolve(tab);
    });
  });
}

function getHostName(url) {
  const details = new URL(url);
  return details.hostname;
}

// history remover
chrome.alarms.onAlarm.addListener(async function (alarm) {
  if (alarm.name === analyticsEnum.historyRemoverAlarmName) {
    console.log("removing History");
    await saveHistory({});
  }
});
