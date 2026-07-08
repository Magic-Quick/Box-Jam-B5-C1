import { _decorator, Component, Node, sys } from 'cc';
import plbx from '../plbx_html/plbx_html_playable';

const { ccclass, property } = _decorator;

@ccclass('StoreLinkButton')
export class StoreLinkButton extends Component {
  @property({ tooltip: 'Ссылка на Google Play (Android)' })
  androidUrl: string = '';

  @property({ tooltip: 'Ссылка на App Store (iOS)' })
  iosUrl: string = '';

  @property({ tooltip: 'Ссылка по умолчанию для редактора и других платформ' })
  defaultUrl: string = '';

  start() {
    this.node.on(Node.EventType.TOUCH_END, this.onButtonClick, this);
    this.syncUrlsToBridge();
  }

  onDestroy() {
    this.node.off(Node.EventType.TOUCH_END, this.onButtonClick, this);
  }

  private onButtonClick(): void {
    this.syncUrlsToBridge();
    const url = this.getUrlForPlatform();
    if (!url) {
      console.warn('StoreLinkButton: ссылка для текущей платформы не задана');
      return;
    }

    // Сообщаем сети о завершении геймплея (TikTok reportGameClose) в момент
    // клика по CTA, затем открываем стор (TikTok openAppStore).
    plbx.game_end();
    plbx.download();

    // Fallback for local preview / environments without bridge.
    try {
      // @ts-ignore
      const hasBridge = typeof window !== 'undefined' && (
        // @ts-ignore
        (window.plbx_html && typeof window.plbx_html.download === 'function')
        // @ts-ignore
        || (window.super_html && typeof window.super_html.download === 'function')
      );
      if (!hasBridge) {
        sys.openURL(url);
      }
    } catch {
      sys.openURL(url);
    }
  }

  private syncUrlsToBridge(): void {
    const android = this.androidUrl || this.defaultUrl || this.iosUrl;
    const ios = this.iosUrl || this.defaultUrl || this.androidUrl;
    if (android) {
      plbx.set_google_play_url(android);
    }
    if (ios) {
      plbx.set_app_store_url(ios);
    }
  }

  private getUrlForPlatform(): string {
    switch (sys.os) {
      case sys.OS.ANDROID:
        return this.androidUrl;
      case sys.OS.IOS:
        return this.iosUrl;
      default:
        return this.defaultUrl || this.androidUrl || this.iosUrl;
    }
  }
}
