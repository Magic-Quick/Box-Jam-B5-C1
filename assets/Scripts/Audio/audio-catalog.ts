import { _decorator, Component, AudioClip } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('AudioCatalog')
export class AudioCatalog extends Component {
    @property(AudioClip)
    public backgroundMusic: AudioClip | null = null;

    @property(AudioClip)
    public tap: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: 'Звук появления CTAScreen' })
    public cta: AudioClip | null = null;

    @property({ tooltip: 'Громкость CTA звука (1 = стандартная)' })
    public ctaVolume: number = 1.6;

    @property({ type: AudioClip, tooltip: 'Звук правильно собранного слова (подскок букв)' })
    public readyWord: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: 'Звук при размещении буквы в Word_Bank (item_drop)' })
    public itemDrop: AudioClip | null = null;

    @property({ tooltip: 'Громкость item_drop при полёте слова в корзину (1 = стандартная)' })
    public itemDropCrateVolume: number = 1.35;

    @property({ type: AudioClip, tooltip: 'Звук появления fail-эффекта (wrong)' })
    public wrong: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: 'Звук падения букв в корзину (dropcreat)' })
    public dropCreat: AudioClip | null = null;

    @property({ tooltip: 'Громкость dropcreat (1 = стандартная)' })
    public dropCreatVolume: number = 1.6;

    @property({ type: AudioClip, tooltip: 'Звук появления SOLD OUT (soldoutaudio)' })
    public soldOutAudio: AudioClip | null = null;

    public getSoundByType(soundType: string): AudioClip | null {
        switch (soundType) {
            case 'tap': return this.tap;
            case 'cta': return this.cta;
            case 'readyWord': return this.readyWord;
            case 'itemDrop': return this.itemDrop;
            case 'wrong': return this.wrong;
            case 'dropCreat': return this.dropCreat;
            case 'soldOut': return this.soldOutAudio;
            default: return null;
        }
    }

    public getBackgroundMusic(): AudioClip | null {
        return this.backgroundMusic;
    }
}
