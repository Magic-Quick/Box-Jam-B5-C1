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

    public getSoundByType(soundType: string): AudioClip | null {
        switch (soundType) {
            case 'tap': return this.tap;
            case 'cta': return this.cta;
            case 'readyWord': return this.readyWord;
            default: return null;
        }
    }

    public getBackgroundMusic(): AudioClip | null {
        return this.backgroundMusic;
    }
}
