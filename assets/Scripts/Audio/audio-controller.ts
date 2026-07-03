import { AudioSource, Node } from 'cc';
import type { AudioCatalog } from './audio-catalog';

export class AudioController {
    private readonly catalog: AudioCatalog;
    private readonly sfxAudioSources: AudioSource[] = [];
    private readonly loopAudioSources: Map<string, AudioSource> = new Map();
    private readonly musicAudioSource: AudioSource;
    private readonly audioSourceParent: Node;
    private audioEnabled: boolean = false;
    private musicMutedForCta: boolean = false;

    constructor(params: {
        catalog: AudioCatalog;
        audioSourceParent: Node;
        musicAudioSource: AudioSource;
    }) {
        this.catalog = params.catalog;
        this.audioSourceParent = params.audioSourceParent;
        this.musicAudioSource = params.musicAudioSource;
    }

    public start(): void {
        this.playBackgroundMusic();
    }

    public stop(): void {
        if (this.musicAudioSource) {
            this.musicAudioSource.stop();
        }

        for (const source of this.sfxAudioSources) {
            if (source && source.node) {
                source.node.destroy();
            }
        }
        this.sfxAudioSources.length = 0;

        for (const [_, source] of this.loopAudioSources) {
            if (source && source.node) {
                source.stop();
                source.node.destroy();
            }
        }
        this.loopAudioSources.clear();
    }

    public playLetterTap(): void {
        this.playSound('tap');
    }

    public playCtaAppear(): void {
        this.stopBackgroundMusic();
        this.playSound('cta', this.catalog.ctaVolume);
    }

    public playReadyWord(): void {
        this.playSound('readyWord');
    }

    public playWordBankItemDrop(): void {
        this.playSound('itemDrop');
    }

    public playItemDropLoop(): void {
        this.playLoop('itemDrop', this.catalog.itemDropCrateVolume);
    }

    public stopItemDropLoop(): void {
        this.stopSound('itemDrop');
    }

    public playFailWrong(): void {
        this.playSound('wrong');
    }

    public playDropCreatRepeated(repeatCount: number = 5): void {
        const clip = this.catalog.getSoundByType('dropCreat');
        if (!clip) {
            return;
        }

        const intervalSec = Math.max(0.05, clip.getDuration() * 0.9);
        const volume = this.catalog.dropCreatVolume;
        for (let i = 0; i < repeatCount; i++) {
            setTimeout(() => {
                this.playSound('dropCreat', volume);
            }, i * intervalSec * 1000);
        }
    }

    public playSoldOut(): void {
        this.playSound('soldOut');
    }

    public stopBackgroundMusic(): void {
        this.musicMutedForCta = true;

        if (this.musicAudioSource?.playing) {
            this.musicAudioSource.stop();
        }
    }

    public playSound(soundType: string, volumeScale: number = 1): void {
        const audioClip = this.catalog.getSoundByType(soundType);
        if (!audioClip) return;

        const audioSource = this.getAvailableAudioSource();
        if (audioSource) {
            audioSource.playOneShot(audioClip, volumeScale);
        }
    }

    private playBackgroundMusic(): void {
        if (this.musicMutedForCta) {
            return;
        }

        const musicClip = this.catalog.getBackgroundMusic();
        if (musicClip && this.musicAudioSource) {
            this.musicAudioSource.clip = musicClip;
            this.musicAudioSource.loop = true;
            this.musicAudioSource.volume = 0.3;
            this.musicAudioSource.play();
        }
    }

    private getAvailableAudioSource(): AudioSource | null {
        for (const source of this.sfxAudioSources) {
            if (!source.playing) {
                return source;
            }
        }
        return this.createNewAudioSource();
    }

    private createNewAudioSource(): AudioSource | null {
        if (!this.audioSourceParent) return null;

        const audioNode = new Node(`SFX_AudioSource_${this.sfxAudioSources.length}`);
        audioNode.setParent(this.audioSourceParent);

        const audioSource = audioNode.addComponent(AudioSource);
        audioSource.loop = false;
        audioSource.playOnAwake = false;
        audioSource.volume = 1.0;

        this.sfxAudioSources.push(audioSource);
        return audioSource;
    }

    public playSoundLoop(soundType: string): void {
        if (!this.audioEnabled) return;

        this.playLoop(soundType);
    }

    private playLoop(soundType: string, volumeScale: number = 1): void {
        const audioClip = this.catalog.getSoundByType(soundType);
        if (!audioClip) return;

        if (this.loopAudioSources.has(soundType)) {
            const existingSource = this.loopAudioSources.get(soundType);
            if (existingSource && existingSource.playing) {
                return;
            }
        }

        const audioNode = new Node(`Loop_AudioSource_${soundType}`);
        audioNode.setParent(this.audioSourceParent);

        const audioSource = audioNode.addComponent(AudioSource);
        audioSource.clip = audioClip;
        audioSource.loop = true;
        audioSource.playOnAwake = false;
        audioSource.volume = volumeScale;

        this.loopAudioSources.set(soundType, audioSource);
        audioSource.play();
    }

    public stopSound(soundType: string): void {
        const audioSource = this.loopAudioSources.get(soundType);
        if (audioSource) {
            audioSource.stop();
            if (audioSource.node) {
                audioSource.node.destroy();
            }
            this.loopAudioSources.delete(soundType);
        }
    }

    public enableAudio(): void {
        this.audioEnabled = true;
    }

    public disableAudio(): void {
        this.audioEnabled = false;
    }

    public isAudioEnabled(): boolean {
        return this.audioEnabled;
    }
}
