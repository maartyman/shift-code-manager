const DEFAULT_MAX_RETRY_ROUNDS = 3;
const DEFAULT_REWARDS_URL = "https://shift.gearboxsoftware.com/rewards";

function createRedemptionController() {
  let stopRequested = false;
  let skipRequested = false;

  return {
    requestStop() {
      stopRequested = true;
    },
    requestSkip() {
      skipRequested = true;
    },
    isStopRequested() {
      return stopRequested;
    },
    consumeSkip() {
      if (!skipRequested) {
        return false;
      }
      skipRequested = false;
      return true;
    },
    reset() {
      stopRequested = false;
      skipRequested = false;
    }
  };
}

function createRedeemRunner(deps) {
  const {
    browserApi,
    injectContentScript,
    evaluateInTab,
    checkFinalResult,
    isLoginRequired,
    setCodeState,
    updateCodeOverview = async () => {},
    incrementRetryCount = async () => {},
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    states
  } = deps;

  if (!browserApi || !injectContentScript || !checkFinalResult || !setCodeState || !states) {
    throw new Error("Missing required redeem runner dependencies.");
  }

  const handleControlAction = async ({
    code,
    game,
    platform,
    controller,
    setStatus
  }) => {
    if (controller?.isStopRequested()) {
      await setCodeState(code, states.NEW, game, platform);
      await updateCodeOverview();
      return { success: false, state: "stopped", error: "Stopped by user" };
    }

    if (controller?.consumeSkip()) {
      await setCodeState(code, states.INVALID, game, platform);
      await updateCodeOverview();
      setStatus?.(`Skipped ${code}`);
      return { success: false, state: "invalid", error: "Skipped by user", skipped: true };
    }

    return null;
  };

  const waitForReloadAndInject = async (tabId) => {
    await new Promise((resolve) => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          browserApi.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      browserApi.tabs.onUpdated.addListener(listener);
    });

    let response = null;
    try {
      response = await browserApi.tabs.sendMessage(tabId, { action: "heartbeat" });
    } catch (error) {
      response = null;
    }

    if (response && response.status === "alive") {
      return;
    }

    await injectContentScript(tabId, "shift-handler.js");
    await sleep(1000);
  };

  const processCode = async ({
    code,
    game,
    platform,
    tabId,
    controller,
    retryCount,
    setStatus
  }) => {
    await setCodeState(code, states.CHECKING, game, platform);

    try {
      const controlBefore = await handleControlAction({ code, game, platform, controller, setStatus });
      if (controlBefore) {
        return controlBefore;
      }

      let redemptionResult = null;
      try {
        redemptionResult = await browserApi.tabs.sendMessage(tabId, {
          action: "redeemCode",
          code: code,
          game: game,
          platforms: [platform],
          maxRetries: 0,
          currentRetry: retryCount
        });
      } catch (messageError) {
        const controlAfterMessage = await handleControlAction({
          code,
          game,
          platform,
          controller,
          setStatus
        });
        if (controlAfterMessage) {
          return controlAfterMessage;
        }
      }

      if (redemptionResult && !redemptionResult.success && redemptionResult.state !== "submitted") {
        if (redemptionResult.state === "checked") {
          await setCodeState(code, states.VALIDATED, game, platform);
          return { success: true, state: "validated", alreadyRedeemed: true };
        }
        if (redemptionResult.state === "expired") {
          await setCodeState(code, states.EXPIRED, game, platform);
          return { success: false, state: "expired" };
        }
        if (redemptionResult.state === "invalid") {
          await setCodeState(code, states.INVALID, game, platform);
          return { success: false, state: "invalid" };
        }

        await setCodeState(code, states.ERROR, game, platform);
        return { success: false, state: "error", error: redemptionResult.error };
      }

      await waitForReloadAndInject(tabId);
      const controlAfterReload = await handleControlAction({
        code,
        game,
        platform,
        controller,
        setStatus
      });
      if (controlAfterReload) {
        return controlAfterReload;
      }

      await sleep(500);
      const controlAfterDelay = await handleControlAction({
        code,
        game,
        platform,
        controller,
        setStatus
      });
      if (controlAfterDelay) {
        return controlAfterDelay;
      }

      const finalResult = await checkFinalResult(tabId, code);
      const controlAfterFinal = await handleControlAction({
        code,
        game,
        platform,
        controller,
        setStatus
      });
      if (controlAfterFinal) {
        return controlAfterFinal;
      }

      if (finalResult.state === "redeemed") {
        await setCodeState(code, states.REDEEMED, game, platform);
        return { success: true, state: "redeemed" };
      }
      if (finalResult.state === "checked") {
        await setCodeState(code, states.VALIDATED, game, platform);
        return { success: true, state: "validated", alreadyRedeemed: true };
      }
      if (finalResult.state === "expired") {
        await setCodeState(code, states.EXPIRED, game, platform);
        return { success: false, state: "expired" };
      }
      if (finalResult.state === "invalid") {
        await setCodeState(code, states.INVALID, game, platform);
        return { success: false, state: "invalid" };
      }

      await setCodeState(code, states.ERROR, game, platform);
      return { success: false, state: "error", error: finalResult.error || "Unknown error" };
    } catch (error) {
      await setCodeState(code, states.ERROR, game, platform);
      return { success: false, state: "error", error: error.message };
    }
  };

  const run = async ({
    codesToProcess,
    game,
    platform,
    timingSettings,
    controller,
    setStatus,
    onCodeStart,
    onCodeComplete,
    onTabReady,
    rewardsUrl = DEFAULT_REWARDS_URL,
    maxRetryRounds = DEFAULT_MAX_RETRY_ROUNDS
  }) => {
    const reportStatus = typeof setStatus === "function" ? setStatus : () => {};
    const timing = timingSettings || { codeDelay: 5, retryDelay: 15 };

    let tab = (await browserApi.tabs.query({ url: rewardsUrl })).pop();
    if (!tab) {
      tab = await browserApi.tabs.create({ url: rewardsUrl });
    }

    onTabReady?.(tab);

    await browserApi.tabs.update(tab.id, { url: rewardsUrl });
    await waitForReloadAndInject(tab.id);

    const tabInfo = await browserApi.tabs.get(tab.id);
    if (isLoginRequired(tabInfo.url)) {
      reportStatus("Not logged in! Please log in to SHIFT in the opened tab and try again");
      return { success: false, state: "login_required" };
    }

    let totalProcessed = 0;
    let redeemedCount = 0;
    let finalErrorCount = 0;
    let codeQueue = [...codesToProcess];
    let erroredCodes = [];
    let retryRound = 0;

    while (codeQueue.length > 0 && retryRound <= maxRetryRounds) {
      if (controller?.isStopRequested()) {
        reportStatus("Redemption stopped by user");
        return { success: false, state: "stopped" };
      }

      if (retryRound > 0) {
        reportStatus(`Retry round ${retryRound}/${maxRetryRounds} - ${codeQueue.length} codes remaining`);
        await updateCodeOverview();

        const retryDelay = timing.retryDelay * 1000 + (retryRound * 5000);
        reportStatus(`Waiting ${retryDelay / 1000}s before retry round ${retryRound}...`);
        await sleep(retryDelay);

        await browserApi.tabs.update(tab.id, { url: rewardsUrl });
        await waitForReloadAndInject(tab.id);
        await sleep(3000);

        const retryTabInfo = await browserApi.tabs.get(tab.id);
        if (isLoginRequired(retryTabInfo.url)) {
          reportStatus("Session expired! Please log in to SHIFT in the opened tab and try again");
          return { success: false, state: "login_required" };
        }
      }

      const currentBatch = [...codeQueue];
      codeQueue = [];
      erroredCodes = [];

      for (let i = 0; i < currentBatch.length; i++) {
        if (controller?.isStopRequested()) {
          reportStatus("Redemption stopped by user");
          return { success: false, state: "stopped" };
        }

        const { code } = currentBatch[i];
        onCodeStart?.(code);
        totalProcessed++;

        reportStatus(`Round ${retryRound + 1}: Processing ${i + 1}/${currentBatch.length}: ${code}`);

        const result = await processCode({
          code,
          game,
          platform,
          tabId: tab.id,
          controller,
          retryCount: retryRound,
          setStatus: reportStatus
        });

        onCodeComplete?.(code, result);

        if (!result.success) {
          const reason = result.error || result.state || "unknown";
          console.warn(`Redemption failed for ${code} (${platform}/${game}): ${reason}`);
        }

        if (result.state === "stopped") {
          reportStatus("Redemption stopped by user");
          return result;
        }

        if (result.success || result.state === "validated" || result.state === "redeemed" || result.state === "checked") {
          redeemedCount++;
          await updateCodeOverview();
        } else if (result.state === "error" && retryRound < maxRetryRounds) {
          erroredCodes.push({ code, state: result });
          await incrementRetryCount(code, game);
          await updateCodeOverview();
        } else {
          if (result.state === "error") {
            finalErrorCount++;
          }
          await updateCodeOverview();
        }

        try {
          await updateCodeOverview();
        } catch (overviewError) {
          console.error("Error updating overview:", overviewError);
        }

        if (i < currentBatch.length - 1) {
          const baseDelay = timing.codeDelay * 1000;
          const extraDelayForValidation = result.validated ? 2000 : 0;
          const delay = retryRound === 0
            ? baseDelay + extraDelayForValidation
            : baseDelay + extraDelayForValidation + (retryRound * 2000);
          reportStatus(`Round ${retryRound + 1}: Waiting ${delay / 1000}s before next code...`);
          await sleep(delay);
        }

        if (evaluateInTab) {
          try {
            const message = await evaluateInTab(tab.id, () => {
              const notice = document.getElementsByClassName("alert notice")[0];
              return notice ? notice.innerHTML : null;
            });

            if (message && message.includes("To continue to redeem SHiFT codes, please launch a SHiFT-enabled title first!")) {
              reportStatus("Rate limited - please launch a SHiFT-enabled game first!");
              codeQueue = [];
              erroredCodes = [];
              retryRound = maxRetryRounds + 1;
              break;
            }
          } catch (error) {
            // Ignore script execution errors
          }
        }
      }

      if (erroredCodes.length > 0 && retryRound < maxRetryRounds) {
        codeQueue = erroredCodes;
        retryRound++;
      } else {
        break;
      }
    }

    const expiredCount = totalProcessed - redeemedCount - finalErrorCount;
    reportStatus(`Completed! Redeemed: ${redeemedCount}, Errors: ${finalErrorCount}, Other: ${expiredCount}, Total: ${totalProcessed}`);
    await updateCodeOverview();

    return {
      success: true,
      state: "completed",
      redeemedCount,
      finalErrorCount,
      totalProcessed
    };
  };

  return { run };
}

const RedeemRunner = { createRedeemRunner, createRedemptionController };

if (typeof module !== "undefined" && module.exports) {
  module.exports = RedeemRunner;
}

if (typeof globalThis !== "undefined") {
  globalThis.RedeemRunner = RedeemRunner;
}
