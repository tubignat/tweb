import type { AppChatsManager } from "../../lib/appManagers/appChatsManager";
import type { AppDocsManager } from "../../lib/appManagers/appDocsManager";
import type { AppImManager } from "../../lib/appManagers/appImManager";
import type { AppInlineBotsManager } from "../../lib/appManagers/appInlineBotsManager";
import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import type { AppPhotosManager } from "../../lib/appManagers/appPhotosManager";
import type { AppPollsManager } from "../../lib/appManagers/appPollsManager";
import type { AppProfileManager } from "../../lib/appManagers/appProfileManager";
import type { AppStickersManager } from "../../lib/appManagers/appStickersManager";
import type { AppUsersManager } from "../../lib/appManagers/appUsersManager";
import type { AppWebPagesManager } from "../../lib/appManagers/appWebPagesManager";
import type { ApiManagerProxy } from "../../lib/mtproto/mtprotoworker";
import EventListenerBase from "../../helpers/eventListenerBase";
import { logger, LogLevels } from "../../lib/logger";
import rootScope from "../../lib/rootScope";
import appSidebarRight, { AppSidebarRight } from "../sidebarRight";
import ChatBubbles from "./bubbles";
import ChatContextMenu from "./contextMenu";
import ChatInput from "./input";
import ChatSelection from "./selection";
import ChatTopbar from "./topbar";

export type ChatType = 'chat' | 'pinned' | 'replies' | 'discussion' | 'scheduled';

export default class Chat extends EventListenerBase<{
  setPeer: (mid: number, isTopMessage: boolean) => void
}> {
  public container: HTMLElement;
  public backgroundEl: HTMLElement;

  public topbar: ChatTopbar;
  public bubbles: ChatBubbles;
  public input: ChatInput;
  public selection: ChatSelection;
  public contextMenu: ChatContextMenu;

  public peerId = 0;
  public threadId: number;
  public setPeerPromise: Promise<void>;
  public peerChanged: boolean;

  public log: ReturnType<typeof logger>;

  public type: ChatType = 'chat';
  
  constructor(public appImManager: AppImManager, public appChatsManager: AppChatsManager, public appDocsManager: AppDocsManager, public appInlineBotsManager: AppInlineBotsManager, public appMessagesManager: AppMessagesManager, public appPeersManager: AppPeersManager, public appPhotosManager: AppPhotosManager, public appProfileManager: AppProfileManager, public appStickersManager: AppStickersManager, public appUsersManager: AppUsersManager, public appWebPagesManager: AppWebPagesManager, public appPollsManager: AppPollsManager, public apiManager: ApiManagerProxy) {
    super();

    this.container = document.createElement('div');
    this.container.classList.add('chat');

    this.backgroundEl = document.createElement('div');
    this.backgroundEl.classList.add('chat-background');

    // * constructor end

    this.log = logger('CHAT', LogLevels.log | LogLevels.warn | LogLevels.debug | LogLevels.error);
    //this.log.error('Chat construction');

    this.container.append(this.backgroundEl);
    this.appImManager.chatsContainer.append(this.container);
  }

  public setType(type: ChatType) {
    this.type = type;

    if(this.type === 'scheduled') {
      this.getMessagesStorage = () => this.appMessagesManager.getScheduledMessagesStorage(this.peerId);
      //this.getMessage = (mid) => this.appMessagesManager.getMessageFromStorage(this.appMessagesManager.getScheduledMessagesStorage(this.peerId), mid);
    }
  }

  private init() {
    this.topbar = new ChatTopbar(this, appSidebarRight, this.appMessagesManager, this.appPeersManager, this.appChatsManager);
    this.bubbles = new ChatBubbles(this, this.appMessagesManager, this.appStickersManager, this.appUsersManager, this.appInlineBotsManager, this.appPhotosManager, this.appDocsManager, this.appPeersManager, this.appChatsManager);
    this.input = new ChatInput(this, this.appMessagesManager, this.appDocsManager, this.appChatsManager, this.appPeersManager, this.appWebPagesManager, this.appImManager);
    this.selection = new ChatSelection(this, this.bubbles, this.input, this.appMessagesManager);
    this.contextMenu = new ChatContextMenu(this.bubbles.bubblesContainer, this, this.appMessagesManager, this.appChatsManager, this.appPeersManager, this.appPollsManager);

    if(this.type === 'chat') {
      this.topbar.constructPeerHelpers();
    } else if(this.type === 'pinned') {
      this.topbar.constructPinnedHelpers();
    }

    this.topbar.construct();
    this.input.construct();

    if(this.type === 'chat') { // * гений в деле, разный порядок из-за разной последовательности действий
      this.bubbles.constructPeerHelpers();
      this.input.constructPeerHelpers();
    } else if(this.type === 'pinned') {
      this.bubbles.constructPinnedHelpers();
      this.input.constructPinnedHelpers();
    } else if(this.type === 'scheduled') {
      this.bubbles.constructScheduledHelpers();
      this.input.constructPeerHelpers();
    } else if(this.type === 'discussion') {
      this.bubbles.constructPeerHelpers();
      this.input.constructPeerHelpers();
    }

    this.container.classList.add('type-' + this.type);
    this.container.append(this.topbar.container, this.bubbles.bubblesContainer, this.input.chatInput);
  }

  public destroy() {
    //const perf = performance.now();

    this.topbar.destroy();
    this.bubbles.destroy();
    this.input.destroy();

    delete this.topbar;
    delete this.bubbles;
    delete this.input;
    delete this.selection;
    delete this.contextMenu;

    this.container.remove();

    //this.log.error('Chat destroy time:', performance.now() - perf);
  }

  public cleanup() {
    this.input.cleanup();
    this.selection.cleanup();

    this.peerChanged = false;
  }

  public setPeer(peerId: number, lastMsgId?: number) {
    if(this.init) {
      this.init();
      this.init = null;
    }

    if(this.type === 'discussion' && !this.threadId) {
      this.threadId = lastMsgId;
      lastMsgId = undefined;
    }

    //console.time('appImManager setPeer');
    //console.time('appImManager setPeer pre promise');
    ////console.time('appImManager: pre render start');
    if(peerId == 0) {
      appSidebarRight.toggleSidebar(false);
      this.peerId = peerId;
      this.cleanup();
      this.topbar.setPeer(peerId);
      this.bubbles.setPeer(peerId);
      rootScope.broadcast('peer_changed', peerId);

      return;
    }

    const samePeer = this.peerId == peerId;

    // set new
    if(!samePeer) {
      if(appSidebarRight.historyTabIds[appSidebarRight.historyTabIds.length - 1] == AppSidebarRight.SLIDERITEMSIDS.search) {
        appSidebarRight.searchTab.closeBtn?.click();
      }

      this.peerId = peerId;
      appSidebarRight.sharedMediaTab.setPeer(peerId);
      this.cleanup();
    } else {
      this.peerChanged = true;
    }

    const result = this.bubbles.setPeer(peerId, lastMsgId);
    if(!result) {
      return;
    }

    const {promise} = result;

    //console.timeEnd('appImManager setPeer pre promise');
    
    this.setPeerPromise = promise.finally(() => {
      if(this.peerId == peerId) {
        this.setPeerPromise = null;
      }
    });

    appSidebarRight.sharedMediaTab.setLoadMutex(this.setPeerPromise);
    appSidebarRight.sharedMediaTab.loadSidebarMedia(true);
    /* this.setPeerPromise.then(() => {
      appSidebarRight.sharedMediaTab.loadSidebarMedia(false);
    }); */

    return result;
  }

  public finishPeerChange(isTarget: boolean, isJump: boolean, lastMsgId: number) {
    if(this.peerChanged) return;

    let peerId = this.peerId;
    this.peerChanged = true;

    this.topbar.setPeer(peerId);
    this.topbar.finishPeerChange(isTarget, isJump, lastMsgId);
    this.bubbles.finishPeerChange();
    this.input.finishPeerChange();

    appSidebarRight.sharedMediaTab.fillProfileElements();

    this.log.setPrefix('CHAT-' + peerId + '-' + this.type);

    rootScope.broadcast('peer_changed', peerId);
  }

  public getMessagesStorage() {
    return this.appMessagesManager.getMessagesStorage(this.peerId);
  }

  public getMessage(mid: number) {
    return this.appMessagesManager.getMessageFromStorage(this.getMessagesStorage(), mid);
    //return this.appMessagesManager.getMessageByPeer(this.peerId, mid);
  }

  public getMidsByMid(mid: number) {
    return this.appMessagesManager.getMidsByMessage(this.getMessage(mid));
  }
}