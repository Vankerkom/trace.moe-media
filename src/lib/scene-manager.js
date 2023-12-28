import detectScene from "./detect-scene.js";

export class SceneManager {

    _memoryCache = new Map();

    async detectScene(videoFilePath, timestamp, minDuration) {
        const cachedScene = this.getSceneFromCache(videoFilePath, timestamp);

        if (cachedScene) {
            return cachedScene;
        }

        console.warn(`Scene detect cache miss data for timestamp: ${timestamp}, media: ${videoFilePath}`);

        const sceneData = await detectScene(videoFilePath, timestamp, minDuration);

        if (!sceneData) {
            console.warn(`Could not process scene data for timestamp: ${timestamp}, media: ${videoFilePath}`);
            return null;
        }

        this.addSceneToCache(videoFilePath, sceneData);

        return sceneData;
    }

    getSceneFromCache(videoFilePath, t) {
        if (!this._memoryCache.has(videoFilePath)) {
            return null;
        }

        return this._memoryCache.get(videoFilePath)
            .find(cachedScene => t >= cachedScene.start && t < cachedScene.end)
            ?? null;
    }

    addSceneToCache(file, sceneData) {
        if (!this._memoryCache.has(file)) {
            this._memoryCache.set(file, []);
        }

        this._memoryCache.get(file).push(sceneData);
    }

}

export const sceneManager = new SceneManager();
