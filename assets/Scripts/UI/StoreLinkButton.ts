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
  }

  onDestroy() {
    this.node.off(Node.EventType.TOUCH_END, this.onButtonClick, this);
  }

  private onButtonClick(): void {
    const url = this.getUrlForPlatform();
    if (!url) {
      console.warn('StoreLinkButton: ссылка для текущей платформы не задана');
      return;
    }

    plbx.download();

    sys.openURL(url);
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
