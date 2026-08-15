function startPolling(bot, onFatalError) {
    return new Promise((resolve, reject) => {
        let connected = false;
        const pollingPromise = bot.launch({}, () => {
            connected = true;
            resolve({ pollingPromise });
        });

        pollingPromise.catch((error) => {
            if (!connected) {
                reject(error);
                return;
            }
            onFatalError(error);
        });
    });
}

module.exports = { startPolling };
