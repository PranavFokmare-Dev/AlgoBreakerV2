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
  const windowSessions = {
    //window_id -> // windowData
  };
  const windowData = {
    currentTabId: -1,
    tabSessions: {},
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
  
  function getOrCreateWindowSession(windowId) {
    if (windowSessions[windowId] === undefined) {
      windowSessions[windowId] = {
        currentTabId: -1,
        tabSessions: {},
      };
    }
    return windowSessions[windowId];
  }
  
  chrome.tabs.onActivated.addListener(async function (activeInfo) {
    let newWindowId = activeInfo.windowId;
    await handleActiveChange(newWindowId, activeInfo.tabId);
  });
  chrome.windows.onFocusChanged.addListener(async function (newWindowId) {
    let oldWindowId = currentWindowId;
    currentWindowId = newWindowId;
  
    if (oldWindowId !== newWindowId) {
      await endSessionInOldWindow();
      const focusedWindowAlreadyPresent = windowSessions[newWindowId] !== undefined;
      if (focusedWindowAlreadyPresent) {
        restartSessionForExistingTab();
      }
    }
  
  
  
    function restartSessionForExistingTab() {
      const window = windowSessions[newWindowId];
      const session = window.tabSessions[window.currentTabId];
      session.startTime = Date.now();
    }
  
    async function endSessionInOldWindow() {
      if (windowSessions[oldWindowId] !== undefined) {
        let oldWindow = windowSessions[oldWindowId];
        await endSession(oldWindow.currentTabId, oldWindowId);
      }
    }
  });
  
  async function getActiveTabIn(windowId) {
    let queryOptions = { active: true, windowId: windowId };
    // `tab` will either be a `tabs.Tab` instance or `undefined`.
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
  }
  
  async function handleActiveChange(windowId, tabId) {
    let window = getOrCreateWindowSession(windowId);
    let currentTabId = window.currentTabId;
    let tabSessions = window.tabSessions;
  
    if (currentTabId !== analyticsEnum.NoTabSet) {
      await endSession(currentTabId, windowId);
    }
    window.currentTabId = tabId;
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
  }
  
  chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
    const notUpdatedToNewTab = tab.url != analyticsEnum.newTabUrl;
    let windowId = tab.windowId;
    await handleUpdate(windowId, notUpdatedToNewTab, tabId, tab);
  
  });
  async function handleUpdate(windowId, notUpdatedToNewTab, tabId, tab) {
    let window = getOrCreateWindowSession(windowId);
    let currentTabId = window.currentTabId;
    let tabSessions = window.tabSessions;
  
    if (notUpdatedToNewTab) {
      if (tabSessions[tabId] !== undefined) {
        const linkUpdatedOnNewTab =
          tabSessions[tabId].url === analyticsEnum.emptyUrl;
        if (linkUpdatedOnNewTab) {
          tabSessions[tabId].url = getHostName(tab.url);
          tabSessions[tabId].startTime = Date.now();
        } else {
          //In current tab user changed the link
          if (tabId === currentTabId) {
            await endSession(tabId, windowId);
            tabSessions[tabId] = {
              url: getHostName(tab.url),
              startTime: Date.now(),
              endTime: 0,
            };
          }
        }
      } else {
        //middle click
        console.log("middle click");
        tabSessions[tabId] = {
          url: getHostName(tab.url),
          startTime: 0,
          endTime: 0,
        };
      }
    }
  }
  
  async function endSession(tabId, windowId) {
    let tabSessions = windowSessions[windowId].tabSessions;
    const session = tabSessions[tabId];
    const timeSpent =
      Date.now() - (session.startTime == 0) ? Date.now : session.startTime;
    let history = await getHistory();
    if (history[session.url] === undefined) {
      history[session.url] = 0;
    }
    history[session.url] += Math.max(timeSpent, 0);
    session.startTime = 0;
    await saveHistory(history);
  }
  
  chrome.tabs.onRemoved.addListener(async function (tabId, removedInfo) {
    let windowId = removedInfo.windowId;
    let window = getOrCreateWindowSession(windowId);
    let currentTabId = window.currentTabId;
    let tabSessions = window.tabSessions;
    if (tabSessions[tabId] !== undefined) {
      if (tabId == currentTabId) await endSession(tabId, windowId);
      delete tabSessions[tabId];
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
  