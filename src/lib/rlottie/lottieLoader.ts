/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import animationIntersector, {AnimationItemGroup} from '../../components/animationIntersector';
import {MOUNT_CLASS_TO} from '../../config/debug';
import pause from '../../helpers/schedulers/pause';
import {logger, LogTypes} from '../logger';
import RLottiePlayer, {RLottieOptions} from './rlottiePlayer';
import QueryableWorker from './queryableWorker';
import blobConstruct from '../../helpers/blob/blobConstruct';
import apiManagerProxy from '../mtproto/mtprotoworker';
import IS_WEB_ASSEMBLY_SUPPORTED from '../../environment/webAssemblySupport';
import makeError from '../../helpers/makeError';

export type LottieAssetName = 'EmptyFolder' | 'Folders_1' | 'Folders_2' |
  'TwoFactorSetupMonkeyClose' | 'TwoFactorSetupMonkeyCloseAndPeek' |
  'TwoFactorSetupMonkeyCloseAndPeekToIdle' | 'TwoFactorSetupMonkeyIdle' |
  'TwoFactorSetupMonkeyPeek' | 'TwoFactorSetupMonkeyTracking' |
  'voice_outlined2' | 'voip_filled' | 'voice_mini';

export class LottieLoader {
  private loadPromise: Promise<void> = !IS_WEB_ASSEMBLY_SUPPORTED ? Promise.reject() : undefined;
  private loaded = false;

  private workersLimit = 4;
  private players: {[reqId: number]: RLottiePlayer} = {};
  private playersByCacheName: {[cacheName: string]: Set<RLottiePlayer>} = {};

  private workers: QueryableWorker[] = [];
  private curWorkerNum = 0;

  private log = logger('LOTTIE', LogTypes.Error);

  public getAnimation(element: HTMLElement) {
    for(const i in this.players) {
      if(this.players[i].el.includes(element)) {
        return this.players[i];
      }
    }

    return null;
  }

  public setLoop(loop: boolean) {
    for(const i in this.players) {
      const player = this.players[i];
      player.loop = loop;
      player.autoplay = player._autoplay;
    }
  }

  public loadLottieWorkers() {
    if(this.loadPromise) {
      return this.loadPromise;
    }

    return this.loadPromise = new Promise((resolve, reject) => {
      let remain = this.workersLimit;
      for(let i = 0; i < this.workersLimit; ++i) {
        const worker = new Worker(new URL('./rlottie.worker.ts', import.meta.url));
        const queryableWorker = this.workers[i] = new QueryableWorker(worker);

        queryableWorker.addEventListener('ready', () => {
          this.log('worker #' + i + ' ready');

          queryableWorker.addEventListener('frame', this.onFrame);
          queryableWorker.addEventListener('loaded', this.onPlayerLoaded);
          queryableWorker.addEventListener('error', this.onPlayerError);

          --remain;
          if(!remain) {
            this.log('workers ready');
            resolve();
            this.loaded = true;
          }
        }, {once: true});

        queryableWorker.addEventListener('workerError', (error) => {
          reject('rlottie load error: ' + error.message);
          this.loaded = false;
        }, {once: true});
      }
    });
  }

  public loadAnimationAsAsset(params: Omit<RLottieOptions, 'animationData' | 'name'>, name: LottieAssetName) {
    (params as RLottieOptions).name = name;
    return this.loadAnimationFromURL(params, 'assets/tgs/' + name + '.json');
  }

  public loadAnimationFromURL(params: Omit<RLottieOptions, 'animationData'>, url: string): Promise<RLottiePlayer> {
    if(!IS_WEB_ASSEMBLY_SUPPORTED) {
      return this.loadPromise as any;
    }

    if(!this.loaded) {
      this.loadLottieWorkers();
    }

    return fetch(url)
    .then((res) => {
      if(!res.headers || res.headers.get('content-type') === 'application/octet-stream') {
        return res.arrayBuffer().then((data) => apiManagerProxy.invokeCrypto('gzipUncompress', data)).then((arr) => blobConstruct(arr as Uint8Array, ''))
      } else {
        return res.blob();
      }
    })
    /* .then((str) => {
      return new Promise<string>((resolve) => setTimeout(() => resolve(str), 2e3));
    }) */
    .then((blob) => {
      const newParams = Object.assign(params, {animationData: blob, needUpscale: true});
      if(!newParams.name) newParams.name = url;
      return this.loadAnimationWorker(newParams);
    });
  }

  public waitForFirstFrame(player: RLottiePlayer) {
    return Promise.race([
      /* new Promise<void>((resolve) => {
        player.addEventListener('firstFrame', () => {
          setTimeout(() => resolve(), 1500);
        }, true);
      }) */
      new Promise<void>((resolve) => {
        player.addEventListener('firstFrame', resolve, {once: true});
      }),
      pause(2500)
    ]).then(() => player);
  }

  public async loadAnimationWorker(
    params: RLottieOptions,
    group: AnimationItemGroup = params.group || '',
    middleware?: () => boolean
  ): Promise<RLottiePlayer> {
    if(!IS_WEB_ASSEMBLY_SUPPORTED) {
      return this.loadPromise as any;
    }

    if(!this.loaded) {
      await this.loadLottieWorkers();
    }

    if(middleware && !middleware()) {
      throw makeError('MIDDLEWARE');
    }

    if(params.sync) {
      const cacheName = RLottiePlayer.CACHE.generateName(params.name, params.width, params.height, params.color, params.toneIndex);
      const players = this.playersByCacheName[cacheName];
      if(players?.size) {
        return Promise.resolve(players.entries().next().value[0]);
      }
    }

    const containers = Array.isArray(params.container) ? params.container : [params.container];
    if(!params.width || !params.height) {
      params.width = parseInt(containers[0].style.width);
      params.height = parseInt(containers[0].style.height);
    }

    if(!params.width || !params.height) {
      throw new Error('No size for sticker!');
    }

    params.group = group;

    const player = this.initPlayer(containers, params);

    animationIntersector.addAnimation(player, group);

    return player;
  }

  private onPlayerLoaded = (reqId: number, frameCount: number, fps: number) => {
    const player = this.players[reqId];
    if(!player) {
      this.log.warn('onPlayerLoaded on destroyed player:', reqId, frameCount);
      return;
    }

    this.log.debug('onPlayerLoaded');
    player.onLoad(frameCount, fps);
  };

  private onFrame = (reqId: number, frameNo: number, frame: Uint8ClampedArray | ImageBitmap) => {
    const player = this.players[reqId];
    if(!player) {
      this.log.warn('onFrame on destroyed player:', reqId, frameNo);
      return;
    }

    if(player.clamped !== undefined && frame instanceof Uint8ClampedArray) {
      player.clamped = frame;
    }

    player.renderFrame(frame, frameNo);
  };

  private onPlayerError = (reqId: number, error: Error) => {
    const player = this.players[reqId];
    if(!player) {
      return;
    }

    // ! will need refactoring later, this is not the best way to remove the animation
    const animations = animationIntersector.getAnimations(player.el[0]);
    animations.forEach((animation) => {
      animationIntersector.checkAnimation(animation, true, true);
    });
  };

  public onDestroy(reqId: number) {
    delete this.players[reqId];
  }

  public destroyWorkers() {
    if(!IS_WEB_ASSEMBLY_SUPPORTED) {
      return;
    }

    this.workers.forEach((worker, idx) => {
      worker.terminate();
      this.log('worker #' + idx + ' terminated');
    });

    this.log('workers destroyed');
    this.workers.length = 0;
    this.curWorkerNum = 0;
    this.loaded = false;
    this.loadPromise = undefined;
  }

  private initPlayer(el: RLottiePlayer['el'], options: RLottieOptions) {
    const player = new RLottiePlayer({
      el,
      worker: this.workers[this.curWorkerNum++],
      options
    });

    const {reqId, cacheName} = player;
    this.players[reqId] = player;

    const playersByCacheName = cacheName ? this.playersByCacheName[cacheName] ??= new Set() : undefined;
    if(cacheName) {
      playersByCacheName.add(player);
    }

    if(this.curWorkerNum >= this.workers.length) {
      this.curWorkerNum = 0;
    }

    player.addEventListener('destroy', () => {
      this.onDestroy(reqId);
      if(playersByCacheName.delete(player) && !playersByCacheName.size) {
        delete this.playersByCacheName[cacheName];
      }
    });

    player.loadFromData(options.animationData);

    return player;
  }
}

const lottieLoader = new LottieLoader();
MOUNT_CLASS_TO.lottieLoader = lottieLoader;
export default lottieLoader;
