import { _decorator, Component, Node, EventTouch, UITransform, Vec3, tween, Tween, Animation, CCFloat, Input, input, AudioSource, find, UIOpacity, view, Sprite, SpriteFrame, assetManager } from 'cc';
import { AudioCatalog } from '../Audio/audio-catalog';
import { AudioController } from '../Audio/audio-controller';
import plbx from '../plbx_html/plbx_html_playable';
const { ccclass, property } = _decorator;

/**
 * Одна буква в стопке
 */
interface StackLetter {
  node: Node;          // нода буквы
  letter: string;      // сама буква (A, N, P...)
  depth: number;       // глубина вложенности (больше = выше в стопке = берётся раньше)
  originalParent: Node; // исходный родитель
  originalPos: Vec3;   // исходная локальная позиция
  originalWorldPos: Vec3; // исходная мировая позиция
  originalScale: Vec3; // исходный масштаб
  originalSiblingIndex: number; // порядок отрисовки в стопке
  taken: boolean;      // взята ли буква
  bankPlaced: boolean; // буква полностью размещена в Word_Bank (полёт + settle)
}

/**
 * Стопка букв
 */
interface LetterStack {
  rootNode: Node;          // корневая нода стопки (letters_A)
  letters: StackLetter[];  // буквы отсортированы: верхняя (глубокая) первая
}

/**
 * GameCore - единый скрипт со всей логикой игры BoxJam.
 * Работает со стопками букв (вложенные ноды), берёт буквы сверху вниз.
 */
@ccclass('GameCore')
export class GameCore extends Component {
  // ===== ССЫЛКИ НА НОДЫ (назначить в Inspector) =====

  @property({ type: Node, tooltip: 'Контейнер со стопками букв (Letters)' })
  lettersContainer: Node = null;

  @property({ type: Node, tooltip: 'Зона ввода (Word_Bank)' })
  wordBank: Node = null;

  @property({ type: Node, tooltip: 'Контейнер с ящиками (Crate)' })
  cratesContainer: Node = null;

  @property({ type: [Node], tooltip: '6 штампов SOLD OUT (по порядку ящиков)' })
  stampNodes: Node[] = [];

  @property({ type: Node, tooltip: 'Нода эффекта ошибки (Fail)' })
  failEffect: Node = null;

  @property({ type: Node, tooltip: 'Glow-эффект выбора (VFX/GlowEffect/glow)' })
  glowEffect: Node = null;

  @property({ type: Sprite, tooltip: 'Спрайт EffectGold (дочерняя нода Word_Bank/EffectGold)' })
  effectGold: Sprite = null;

  private effectGoldNode: Node | null = null;

  @property({ type: AudioCatalog, tooltip: 'Каталог звуков (audio-catalog)' })
  audioCatalog: AudioCatalog = null;

  @property({ type: Node, tooltip: 'Слой поверх VFX для полёта букв к корзине (опционально)' })
  lettersFlightLayer: Node = null;

  @property({ type: Node, tooltip: 'Экран CTA (CTAScreen)' })
  ctaScreen: Node = null;

  @property({ type: Node, tooltip: 'Нода руки-подсказки (опционально; иначе создаётся на Canvas)' })
  handHint: Node = null;

  @property({ type: SpriteFrame, tooltip: 'Спрайт руки (assets/Art/Sprites/Hand/Hand)' })
  handSpriteFrame: SpriteFrame = null;

  @property({ type: CCFloat, tooltip: 'Тонкая подстройка позиции руки по Y (px)' })
  handHintOffsetY: number = 0;

  @property({ type: CCFloat, tooltip: 'Скорость руки-подсказки (1 = медленно, 2 = в 2 раза быстрее)' })
  handHintSpeed: number = 1;

  // ===== ПАРАМЕТРЫ =====

  @property({ type: CCFloat, tooltip: 'Масштаб буквы в зоне ввода' })
  selectScale: number = 1.0;

  @property({ type: CCFloat, tooltip: 'Длительность анимации' })
  animDuration: number = 0.25;

  @property({ type: CCFloat, tooltip: 'Расстояние между буквами в Word_Bank' })
  letterSpacing: number = 60;

  @property({ type: CCFloat, tooltip: 'Смещение первой буквы влево от центра Word_Bank' })
  wordBankStartOffset: number = 120;

  @property({ type: CCFloat, tooltip: 'Заполнение слота буквой (0..1), 1 = почти впритык' })
  slotFillPercent: number = 0.98;

  @property({ type: CCFloat, tooltip: 'Минимальный множитель масштаба буквы в слоте' })
  slotScaleMin: number = 0.5;

  @property({ type: CCFloat, tooltip: 'Максимальный множитель масштаба буквы в слоте' })
  slotScaleMax: number = 2.0;

  @property({ type: CCFloat, tooltip: 'Высота плавного подъема буквы при выборе' })
  selectLiftY: number = 14;

  @property({ type: CCFloat, tooltip: 'Длительность подъема буквы (сек)' })
  selectLiftDuration: number = 0.16;

  @property({ type: CCFloat, tooltip: 'Пауза в верхней точке (сек)' })
  selectHoldDuration: number = 0.05;

  @property({ type: CCFloat, tooltip: 'Длительность опускания буквы (сек)' })
  selectSettleDuration: number = 0.14;

  @property({ type: CCFloat, tooltip: 'Легкий scale-пульс при выборе (1.04 = +4%)' })
  selectPulseScale: number = 1.04;

  @property({ type: CCFloat, tooltip: 'Запасная длительность fail, если нет Animation (сек)' })
  failEffectDuration: number = 1;

  @property({ type: CCFloat, tooltip: 'Подпрыг буквы в Word_Bank (px)' })
  bankSettleLiftY: number = 20;

  @property({ type: CCFloat, tooltip: 'Поворот буквы в Word_Bank (градусы Z)' })
  bankSettleRotateZ: number = 12;

  @property({ type: CCFloat, tooltip: 'Длительность основного подъема settle (сек)' })
  bankSettleUpDuration: number = 0.11;

  @property({ type: CCFloat, tooltip: 'Длительность основного приземления settle (сек)' })
  bankSettleDownDuration: number = 0.15;

  @property({ type: CCFloat, tooltip: 'Скорость settle в банке (1 = норм, больше = быстрее)' })
  bankSettlePlaybackSpeed: number = 1.25;

  @property({ type: CCFloat, tooltip: 'Высота второго отскока от основного (0..1)' })
  bankSettleSecondBounceRatio: number = 0.45;

  @property({ type: CCFloat, tooltip: 'Высота стопки букв над корзиной (px)' })
  crateHoverOffsetY: number = 75;

  @property({ type: CCFloat, tooltip: 'Смещение букв в стопке над корзиной (px)' })
  crateStackOffsetY: number = 6;

  @property({ type: CCFloat, tooltip: 'Длительность полета буквы к корзине (сек)' })
  crateFlyDuration: number = 0.16;

  @property({ type: CCFloat, tooltip: 'Задержка между вылетом букв к корзине (сек)' })
  crateFlyStagger: number = 0.09;

  @property({ type: CCFloat, tooltip: 'Пауза над корзиной перед падением (сек)' })
  crateHoverHoldDuration: number = 0.4;

  @property({ type: CCFloat, tooltip: 'Длительность падения буквы в корзину (сек)' })
  crateDropDuration: number = 0.14;

  @property({ type: CCFloat, tooltip: 'Задержка между падениями букв (сек)' })
  crateDropStagger: number = 0.08;

  @property({ type: CCFloat, tooltip: 'Смещение падения внутрь корзины (px, отрицательное = вниз)' })
  crateDropOffsetY: number = -18;

  @property({ type: CCFloat, tooltip: 'Масштаб буквы над корзиной перед падением (абсолютный)' })
  crateFlyScale: number = 0.5;

  @property({ type: CCFloat, tooltip: 'Доп. сжатие стопки для длинных слов (6+ букв)' })
  crateLongWordScaleFactor: number = 0.82;

  @property({ type: CCFloat, tooltip: 'Пауза после settle последней буквы перед подскоком слова (сек)' })
  wordSuccessPreDelay: number = 0.1;

  @property({ type: CCFloat, tooltip: 'Высота общего подскока собранного слова (px)' })
  wordBounceLiftY: number = 18;

  @property({ type: CCFloat, tooltip: 'Длительность подъема при подскоке слова (сек)' })
  wordBounceUpDuration: number = 0.12;

  @property({ type: CCFloat, tooltip: 'Длительность приземления при подскоке слова (сек)' })
  wordBounceDownDuration: number = 0.16;

  @property({ type: CCFloat, tooltip: 'Пауза после подскока слова перед полетом в корзину (сек)' })
  wordSuccessPostBounceDelay: number = 0.2;

  @property({ type: CCFloat, tooltip: 'Показать CTA после N нажатий на экран' })
  ctaTapCount: number = 12;

  @property({ type: CCFloat, tooltip: 'Длительность анимации появления CTA (сек)' })
  ctaAppearDuration: number = 0.2;

  // ===== ВНУТРЕННИЕ ДАННЫЕ =====

  // Список валидных слов
  private validWords: string[] = ['GRAPE', 'LEMON', 'PEACH', 'APPLE', 'MELON', 'MANGO'];

  // Все стопки
  private stacks: LetterStack[] = [];

  // Карта: любая нода стопки -> сама стопка (для быстрого поиска при клике)
  private nodeToStack: Map<Node, LetterStack> = new Map();

  // Выбранные буквы (текущее слово)
  private selectedLetters: StackLetter[] = [];

  // Использованные слова
  private usedWords: Set<string> = new Set();

  // Слоты внутри Word_Bank: Slot_0, Slot_1, ...
  private wordBankSlots: Node[] = [];
  private occupiedWordBankSlots: Set<Node> = new Set();

  // Флаг обработки (блокировка во время анимации возврата)
  private isProcessing: boolean = false;
  private isSelectFeedbackPlaying: boolean = false;
  private glowHomeParent: Node = null;
  private failEffectHomeParent: Node | null = null;
  private failEffectHomeSiblingIndex: number = 0;
  private letterFlyToken: number = 0;
  private crateSequenceToken: number = 0;
  private audioController: AudioController | null = null;
  private musicAudioSource: AudioSource | null = null;
  private screenTapCount: number = 0;
  private isCtaShown: boolean = false;
  private lastTapTime: number = 0;
  private static readonly TAP_DEBOUNCE_MS = 150;
  private canvasTapNode: Node | null = null;
  private handHintToken: number = 0;
  private handHintBaseScale: Vec3 = new Vec3(1, 1, 1);
  private handHintCycleUsedNodes: Set<Node> = new Set();
  private static readonly HAND_SPRITE_UUID = 'fce508d0-f38a-48f0-b46a-83e787e360e9@f9941';
  private static readonly HAND_HINT_SEQUENCE = ['A', 'P', 'P', 'L', 'E'];
  private static readonly HAND_HINT_MOVE_DURATION = 0.55;
  private static readonly HAND_HINT_TAP_DURATION = 0.12;
  private static readonly HAND_HINT_STEP_DELAY = 0.22;
  private static readonly HAND_HINT_CYCLE_DELAY = 0.6;
  private static readonly HAND_HINT_RETRY_DELAY = 0.4;
  private readonly onCanvasResize = (): void => {
    this.setupCanvasTapListeners();
    this.setupSystemInput();
  };

  onLoad() {
    this.setupEffectGold();
  }

  start() {
    this.buildStacks();
    this.setupStamps();
    this.collectWordBankSlots();
    this.setupGlowEffect();
    this.setupFailEffect();
    this.setupEffectGold();
    this.setupAudio();
    this.setupCtaScreen();
    this.setupGlobalInput();
    this.setupHandHint();
    plbx.game_ready();
  }

  onDestroy(): void {
    view.off('canvas-resize', this.onCanvasResize, this);
    this.teardownSystemInput();
    this.teardownCanvasTapListeners();
    this.audioController?.stop();
    this.audioController = null;
    this.musicAudioSource = null;
    this.stopHandHint();
  }

  private setupAudio(): void {
    if (!this.audioCatalog) {
      console.warn('GameCore: audioCatalog не назначен (нода audio-catalog)');
      return;
    }

    let musicNode = this.node.getChildByName('MusicAudioSource');
    if (!musicNode) {
      musicNode = new Node('MusicAudioSource');
      musicNode.setParent(this.node);
    }

    this.musicAudioSource = musicNode.getComponent(AudioSource) ?? musicNode.addComponent(AudioSource);
    this.musicAudioSource.playOnAwake = false;

    this.audioController = new AudioController({
      catalog: this.audioCatalog,
      audioSourceParent: this.node,
      musicAudioSource: this.musicAudioSource,
    });
    this.audioController.start();
    console.log('✓ GameCore: аудио подключено (музыка со старта игры)');
  }

  private setupGlowEffect(): void {
    if (!this.glowEffect) {
      console.warn('GameCore: glowEffect не назначен в Inspector (VFX/GlowEffect/glow)');
      return;
    }

    this.glowHomeParent = this.glowEffect.parent;
    this.glowEffect.active = false;
  }

  private setupFailEffect(): void {
    if (!this.failEffect) {
      return;
    }

    this.failEffectHomeParent = this.failEffect.parent;
    this.failEffectHomeSiblingIndex = this.failEffect.getSiblingIndex();
    this.failEffect.active = false;
    this.resetFailVisual();
  }

  private resolveEffectGoldNode(): Node | null {
    if (this.effectGoldNode?.isValid) {
      return this.effectGoldNode;
    }

    const wordBank = this.wordBank ?? find('Canvas/WorldBank/Word_Bank');
    let effectNode = wordBank?.getChildByName('EffectGold') ?? null;

    if (!effectNode && wordBank) {
      for (const child of wordBank.children) {
        const nested = child.getChildByName('EffectGold');
        if (nested) {
          effectNode = nested;
          break;
        }
      }
    }

    if (effectNode) {
      this.effectGoldNode = effectNode;
      if (!this.effectGold?.isValid) {
        this.effectGold = effectNode.getComponent(Sprite);
      }
    }

    return this.effectGoldNode;
  }

  private resolveEffectGoldSprite(): Sprite | null {
    if (this.effectGold?.isValid && this.effectGold.node?.isValid) {
      this.effectGoldNode = this.effectGold.node;
      return this.effectGold;
    }

    const effectNode = this.resolveEffectGoldNode();
    if (!effectNode) {
      return null;
    }

    const sprite = effectNode.getComponent(Sprite);
    if (sprite) {
      this.effectGold = sprite;
    }

    return sprite;
  }

  private setupEffectGold(): void {
    const effectNode = this.resolveEffectGoldNode();
    if (!effectNode) {
      console.warn('GameCore: EffectGold не найден (Word_Bank/EffectGold)');
      return;
    }

    this.setEffectGoldVisible(false);
  }

  private showEffectGold(): void {
    this.setEffectGoldVisible(true);
  }

  private hideEffectGold(): void {
    this.setEffectGoldVisible(false);
  }

  private setEffectGoldVisible(visible: boolean): void {
    const effectNode = this.resolveEffectGoldNode();
    if (!effectNode) {
      return;
    }

    effectNode.active = visible;

    const sprite = this.resolveEffectGoldSprite();
    if (sprite) {
      sprite.enabled = visible;
    }

    const opacity = effectNode.getComponent(UIOpacity);
    if (opacity) {
      opacity.opacity = visible ? 255 : 0;
    }
  }

  private resolveCtaScreen(): Node | null {
    if (this.ctaScreen?.isValid) {
      return this.ctaScreen;
    }

    let found = find('Canvas/CTAScreen');
    if (!found) {
      const canvas = this.node.scene?.getChildByName('Canvas');
      found = canvas?.children.find((child) => child.name === 'CTAScreen') ?? null;
    }

    if (found) {
      this.ctaScreen = found;
    }

    return found;
  }

  private setupCtaScreen(): void {
    const cta = this.resolveCtaScreen();
    if (!cta) {
      console.warn('GameCore: ctaScreen не найден (Canvas/CTAScreen)');
      return;
    }

    this.resetCtaVisual();
    cta.active = false;
    console.log(`✓ GameCore: CTA скрыт, показ после ${this.ctaTapCount} нажатий`);
  }

  private resolveHandHint(): Node | null {
    if (this.handHint?.isValid) {
      return this.handHint;
    }

    const candidates = [
      'Canvas/hand',
      'Canvas/Hand',
      'Canvas/HandHint',
      'hand',
      'Hand',
    ];

    for (const path of candidates) {
      const node = find(path);
      if (node) {
        this.handHint = node;
        return node;
      }
    }

    return null;
  }

  private ensureHandSpriteFrame(onReady: () => void): void {
    if (this.handSpriteFrame) {
      onReady();
      return;
    }

    assetManager.loadAny({ uuid: GameCore.HAND_SPRITE_UUID }, (uuidErr, uuidAsset) => {
      if (!uuidErr && uuidAsset) {
        this.handSpriteFrame = uuidAsset as SpriteFrame;
      } else {
        console.warn('GameCore: не удалось загрузить спрайт Hand (назначьте Hand Sprite Frame в Inspector)');
      }
      onReady();
    });
  }

  private createHandHintNode(): Node | null {
    const canvas = find('Canvas');
    if (!canvas) {
      console.warn('GameCore: Canvas не найден — рука-подсказка не создана');
      return null;
    }

    if (!this.handSpriteFrame) {
      return null;
    }

    let hand = canvas.getChildByName('Hand');
    if (!hand?.isValid) {
      hand = new Node('Hand');
      hand.layer = canvas.layer;
      const uiTransform = hand.addComponent(UITransform);
      const sprite = hand.addComponent(Sprite);
      sprite.spriteFrame = this.handSpriteFrame;
      const frameSize = this.handSpriteFrame.rect;
      uiTransform.setContentSize(frameSize.width, frameSize.height);
      hand.setParent(canvas);
    } else {
      const sprite = hand.getComponent(Sprite) ?? hand.addComponent(Sprite);
      if (!sprite.spriteFrame) {
        sprite.spriteFrame = this.handSpriteFrame;
      }
    }

    hand.setSiblingIndex(canvas.children.length - 1);
    this.handHint = hand;
    return hand;
  }

  private ensureHandHintNode(onReady: (hand: Node | null) => void): void {
    const existing = this.resolveHandHint();
    if (existing) {
      this.ensureHandSpriteFrame(() => {
        if (this.handSpriteFrame) {
          const sprite = existing.getComponent(Sprite) ?? existing.addComponent(Sprite);
          if (!sprite.spriteFrame) {
            sprite.spriteFrame = this.handSpriteFrame;
          }
        }
        onReady(existing);
      });
      return;
    }

    this.ensureHandSpriteFrame(() => {
      onReady(this.createHandHintNode());
    });
  }

  private setupHandHint(): void {
    this.ensureHandHintNode((hand) => {
      if (!hand) {
        console.warn('GameCore: рука-подсказка недоступна (нет Hand спрайта)');
        return;
      }

      this.handHintBaseScale = hand.scale.clone();
      hand.active = false;

      if (!this.usedWords.has('APPLE')) {
        this.startHandHintLoop();
      }
    });
  }

  private startHandHintLoop(): void {
    this.ensureHandHintNode((hand) => {
      if (!hand) {
        return;
      }

      Tween.stopAllByTarget(hand);
      this.handHintToken++;
      this.handHintCycleUsedNodes.clear();
      hand.active = true;
      hand.scale = this.handHintBaseScale.clone();
      hand.setSiblingIndex(hand.parent.children.length - 1);
      this.playHandHintStep(this.getHandHintNextStepIndex(), this.handHintToken);
    });
  }

  private stopHandHint(): void {
    this.handHintToken++;
    if (!this.handHint?.isValid) {
      return;
    }

    Tween.stopAllByTarget(this.handHint);
    this.handHint.active = false;
    this.handHint.scale = this.handHintBaseScale.clone();
  }

  private getHandHintNextStepIndex(): number {
    for (let i = 0; i < this.selectedLetters.length; i++) {
      const expected = GameCore.HAND_HINT_SEQUENCE[i];
      if (!expected || this.selectedLetters[i].letter !== expected) {
        return 0;
      }
    }
    return Math.min(this.selectedLetters.length, GameCore.HAND_HINT_SEQUENCE.length);
  }

  private getHandHintExcludeNodes(extra: Set<Node> = new Set()): Set<Node> {
    const exclude = new Set(extra);
    for (const sl of this.selectedLetters) {
      if (sl.node?.isValid) {
        exclude.add(sl.node);
      }
    }
    return exclude;
  }

  private refreshHandHintProgress(): void {
    if (this.usedWords.has('APPLE')) {
      this.stopHandHint();
      return;
    }

    this.ensureHandHintNode((hand) => {
      if (!hand?.isValid) {
        return;
      }

      this.handHintToken++;
      const token = this.handHintToken;
      this.handHintCycleUsedNodes.clear();
      Tween.stopAllByTarget(hand);
      hand.active = true;
      if (hand.parent) {
        hand.setSiblingIndex(hand.parent.children.length - 1);
      }

      const nextStep = this.getHandHintNextStepIndex();
      if (nextStep >= GameCore.HAND_HINT_SEQUENCE.length) {
        this.stopHandHint();
        return;
      }

      this.playHandHintStep(nextStep, token);
    });
  }

  private playHandHintStep(stepIndex: number, token: number): void {
    const hand = this.resolveHandHint();
    if (!hand || token !== this.handHintToken) {
      return;
    }

    if (this.usedWords.has('APPLE')) {
      this.stopHandHint();
      return;
    }

    const sequence = GameCore.HAND_HINT_SEQUENCE;
    const progressStep = this.getHandHintNextStepIndex();

    if (progressStep >= sequence.length) {
      this.stopHandHint();
      return;
    }

    if (stepIndex < progressStep) {
      stepIndex = progressStep;
    }

    if (stepIndex === progressStep) {
      this.handHintCycleUsedNodes.clear();
    }

    const letter = sequence[stepIndex];
    const target = this.findTappableNodeForLetter(
      letter,
      this.getHandHintExcludeNodes(this.handHintCycleUsedNodes)
    );
    if (!target) {
      this.scheduleOnce(
        () => this.playHandHintStep(stepIndex, token),
        this.getHandHintDuration(GameCore.HAND_HINT_RETRY_DELAY)
      );
      return;
    }
    this.handHintCycleUsedNodes.add(target);

    const targetPos = this.getHandHintWorldPosition(target);

    const pulseScale = new Vec3(
      this.handHintBaseScale.x * 0.92,
      this.handHintBaseScale.y * 0.92,
      this.handHintBaseScale.z
    );

    Tween.stopAllByTarget(hand);
    const moveDuration = this.getHandHintDuration(GameCore.HAND_HINT_MOVE_DURATION);
    const tapDuration = this.getHandHintDuration(GameCore.HAND_HINT_TAP_DURATION);
    tween(hand)
      .to(moveDuration, { worldPosition: targetPos }, { easing: 'sineInOut' })
      .to(tapDuration, { scale: pulseScale }, { easing: 'quadOut' })
      .to(tapDuration, { scale: this.handHintBaseScale.clone() }, { easing: 'quadIn' })
      .call(() => {
        if (token !== this.handHintToken) {
          return;
        }

        let nextIndex = stepIndex + 1;
        let delay = GameCore.HAND_HINT_STEP_DELAY;

        if (nextIndex >= sequence.length) {
          nextIndex = this.getHandHintNextStepIndex();
          delay = GameCore.HAND_HINT_CYCLE_DELAY;
        }

        this.scheduleOnce(
          () => this.playHandHintStep(nextIndex, token),
          this.getHandHintDuration(delay)
        );
      })
      .start();
  }

  private getHandHintDuration(baseSeconds: number): number {
    const speed = Math.max(0.1, this.handHintSpeed);
    return baseSeconds / speed;
  }

  private getHandHintWorldPosition(target: Node): Vec3 {
    const pos = target.worldPosition.clone();
    const letterUi = target.getComponent(UITransform);
    if (letterUi) {
      const letterHalfH = (letterUi.contentSize.height * Math.abs(target.worldScale.y)) / 2;
      pos.y -= letterHalfH * 0.55;
    }

    const handUi = this.handHint?.getComponent(UITransform);
    if (handUi) {
      const handHalfH = (handUi.contentSize.height * Math.abs(this.handHint.worldScale.y)) / 2;
      // Палец в верхней части спрайта — опускаем pivot руки ещё ниже
      pos.y -= handHalfH * 0.42;
    }

    pos.y += this.handHintOffsetY;
    return pos;
  }

  private findTappableNodeForLetter(letter: string, excludeNodes: Set<Node> = new Set()): Node | null {
    const candidates: StackLetter[] = [];
    for (const stack of this.stacks) {
      const top = this.getTopLetter(stack);
      if (
        top &&
        !top.taken &&
        top.node.isValid &&
        top.letter === letter &&
        !excludeNodes.has(top.node)
      ) {
        candidates.push(top);
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => b.node.worldPosition.y - a.node.worldPosition.y);
    return candidates[0].node;
  }

  private resetCtaVisual(): void {
    if (!this.ctaScreen) {
      return;
    }

    this.ctaScreen.setScale(1, 1, 1);

    const opacity = this.ctaScreen.getComponent(UIOpacity);
    if (opacity) {
      opacity.opacity = 0;
    }

    const anim = this.getCtaAnimation();
    anim?.stop();
  }

  private getCtaAnimation(): Animation | null {
    if (!this.ctaScreen) {
      return null;
    }

    return this.ctaScreen.getComponent(Animation);
  }

  private registerScreenTap(): void {
    if (this.isCtaShown) {
      return;
    }

    const now = Date.now();
    if (now - this.lastTapTime < GameCore.TAP_DEBOUNCE_MS) {
      return;
    }
    this.lastTapTime = now;

    this.screenTapCount++;
    plbx.tap();
    console.log(`👆 Нажатие ${this.screenTapCount}/${this.ctaTapCount}`);

    if (this.screenTapCount >= this.ctaTapCount) {
      this.showCtaScreen();
    }
  }

  private showCtaScreen(): void {
    const cta = this.resolveCtaScreen();
    if (!cta || this.isCtaShown) {
      return;
    }

    this.isCtaShown = true;
    plbx.game_end();
    this.ctaScreen = cta;

    Tween.stopAllByTarget(cta);
    this.resetCtaVisual();
    cta.active = true;
    this.audioController?.playCtaAppear();

    const anim = this.getCtaAnimation();
    const opacity = cta.getComponent(UIOpacity);
    if (anim) {
      anim.play('CTAScreen');
    } else if (opacity) {
      tween(opacity)
        .to(this.ctaAppearDuration, { opacity: 255 })
        .start();
    } else {
      tween(cta)
        .to(this.ctaAppearDuration, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .start();
    }

    console.log(`📢 GameCore: CTA показан (нажатий: ${this.screenTapCount})`);
  }

  private getFailAnimation(): Animation | null {
    if (!this.failEffect) {
      return null;
    }

    return this.failEffect.getComponent(Animation)
      ?? this.failEffect.getComponentInChildren(Animation);
  }

  private getFailVisualNode(): Node | null {
    if (!this.failEffect) {
      return null;
    }

    const anim = this.getFailAnimation();
    return anim ? anim.node : this.failEffect;
  }

  private resetFailVisual(): void {
    const visualNode = this.getFailVisualNode();
    const anim = this.getFailAnimation();
    if (!visualNode) {
      return;
    }

    anim?.off(Animation.EventType.FINISHED, this.hideFailEffect, this);
    anim?.stop();

    const opacity = visualNode.getComponent(UIOpacity);
    if (opacity) {
      opacity.opacity = 0;
    }
  }

  private playFailAnimation(): void {
    const anim = this.getFailAnimation();
    if (!anim) {
      this.scheduleOnce(this.hideFailEffect, this.failEffectDuration);
      return;
    }

    const clipName = anim.defaultClip?.name ?? 'FailScale';
    anim.off(Animation.EventType.FINISHED, this.hideFailEffect, this);
    anim.once(Animation.EventType.FINISHED, this.hideFailEffect, this);
    anim.play(clipName);
  }

  /**
   * Собрать слоты Word_Bank (Slot_0, Slot_1, ...) и отсортировать по индексу.
   */
  private collectWordBankSlots(): void {
    this.wordBankSlots = [];

    if (!this.wordBank) {
      console.warn('GameCore: wordBank не назначен');
      return;
    }

    const slots = this.wordBank.children
      .filter((child: Node) => /^slot_\d+$/i.test(child.name))
      .sort((a: Node, b: Node) => {
        const aMatch = a.name.match(/(\d+)/);
        const bMatch = b.name.match(/(\d+)/);
        const aIndex = aMatch ? parseInt(aMatch[1], 10) : Number.MAX_SAFE_INTEGER;
        const bIndex = bMatch ? parseInt(bMatch[1], 10) : Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex;
      });

    this.wordBankSlots = slots;
    console.log(`GameCore: найдено ${this.wordBankSlots.length} slot-нод в Word_Bank`);
  }

  /**
   * Построить структуру стопок из вложенных нод.
   * Каждый прямой ребёнок Letters = корень стопки.
   * Внутри стопки буквы вложены: root -> child -> grandchild.
   * Самая глубокая = верхняя (берётся первой).
   */
  private buildStacks(): void {
    if (!this.lettersContainer) {
      console.error('❌ GameCore: lettersContainer НЕ назначен в Inspector!');
      return;
    }

    this.stacks = [];
    this.nodeToStack.clear();

    const stackRoots = this.lettersContainer.children;
    console.log(`GameCore: найдено ${stackRoots.length} стопок`);

    stackRoots.forEach((rootNode: Node, stackIndex: number) => {
      const stack: LetterStack = {
        rootNode: rootNode,
        letters: []
      };

      // ДИАГНОСТИКА: вывести полную структуру стопки
      console.log(`\n📦 Стопка[${stackIndex}] структура:`);
      this.debugPrintHierarchy(rootNode, 0);

      // Рекурсивно собрать все буквы в этой стопке
      this.collectLettersInStack(rootNode, stack, 0);

      // Отсортировать: верхняя буква первой
      // Структура плоская: корень A содержит детей N, P как siblings
      // Визуально верхняя буква = та что имеет БОЛЬШИЙ Y (pos.y=14 выше чем pos.y=7)
      // Сортируем по worldPosition.y УБЫВАНИЮ (больший Y = выше = берётся первой)
      stack.letters.sort((a, b) => b.originalWorldPos.y - a.originalWorldPos.y);

      // Связать каждую ноду с этой стопкой (чтобы клик на любой ноде нашёл стопку)
      stack.letters.forEach(sl => {
        this.nodeToStack.set(sl.node, stack);
        this.setupClickOnNode(sl.node, stack);
      });

      this.stacks.push(stack);

      const order = this.getStackTakeOrder(stack)
        .map(l => `${l.letter}(${l.node.name})`)
        .join(' → ');
      const top = this.getTopLetter(stack);
      console.log(
        `  Стопка[${stackIndex}] "${rootNode.name}": снизу→верх ${order}; сейчас сверху: ${top ? `${top.letter}(${top.node.name})` : '—'}`
      );
    });

    console.log(`GameCore: построено ${this.stacks.length} стопок`);
  }

  private getStackTakeOrder(stack: LetterStack): StackLetter[] {
    return stack.letters
      .filter(sl => !sl.taken && sl.node.isValid)
      .sort((a, b) => a.node.worldPosition.y - b.node.worldPosition.y);
  }

  /**
   * ДИАГНОСТИКА: вывести иерархию ноды
   */
  private debugPrintHierarchy(node: Node, indent: number): void {
    const prefix = '  '.repeat(indent + 2);
    const pos = node.position;
    const letter = this.extractLetter(node.name);
    console.log(`${prefix}${node.name} [буква:${letter}] pos(${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)}) детей:${node.children.length}`);
    node.children.forEach((child: Node) => {
      this.debugPrintHierarchy(child, indent + 1);
    });
  }

  /**
   * Рекурсивно собрать буквы в стопке
   */
  private collectLettersInStack(node: Node, stack: LetterStack, depth: number): void {
    const letter = this.extractLetter(node.name);

    // Убедиться что есть UITransform (для кликов)
    if (!node.getComponent(UITransform)) {
      node.addComponent(UITransform);
    }

    const stackLetter: StackLetter = {
      node: node,
      letter: letter,
      depth: depth,
      originalParent: node.parent,
      originalPos: node.position.clone(),
      originalWorldPos: node.worldPosition.clone(),
      originalScale: node.scale.clone(),
      originalSiblingIndex: node.getSiblingIndex(),
      taken: false,
      bankPlaced: false
    };

    stack.letters.push(stackLetter);

    // Рекурсивно обойти детей
    node.children.forEach((child: Node) => {
      this.collectLettersInStack(child, stack, depth + 1);
    });
  }

  /**
   * Извлечь букву из имени ноды: "letters_P" -> "P", "letters_G-001" -> "G"
   */
  private extractLetter(nodeName: string): string {
    let name = nodeName;

    // Взять часть после последнего "_"
    if (name.includes('_')) {
      const parts = name.split('_');
      name = parts[parts.length - 1];
    }

    // Убрать суффикс копии "-001", "-002" и т.п.
    if (name.includes('-')) {
      name = name.split('-')[0];
    }

    // Оставить только первую букву (на случай других суффиксов)
    name = name.trim().toUpperCase();
    if (name.length > 0) {
      // Взять только буквенные символы с начала
      const match = name.match(/^[A-Z]+/);
      if (match) {
        return match[0].charAt(0);
      }
    }

    return name.charAt(0) || 'X';
  }

  /**
   * Повесить клик на ноду буквы
   */
  private setupClickOnNode(node: Node, stack: LetterStack): void {
    node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true;
      this.onStackClicked(stack);
    }, this);
  }

  /**
   * Глобальный слушатель: счёт тапов (CTA) и выбор букв по координатам.
   */
  private setupGlobalInput(): void {
    this.setupSystemInput();
    this.setupCanvasTapListeners();
    view.on('canvas-resize', this.onCanvasResize, this);
  }

  private setupSystemInput(): void {
    this.teardownSystemInput();
    input.on(Input.EventType.TOUCH_START, this.onScreenTap, this);
    input.on(Input.EventType.MOUSE_DOWN, this.onScreenTap, this);
    input.on(Input.EventType.TOUCH_END, this.onGlobalTouch, this);
  }

  private teardownSystemInput(): void {
    input.off(Input.EventType.TOUCH_START, this.onScreenTap, this);
    input.off(Input.EventType.MOUSE_DOWN, this.onScreenTap, this);
    input.off(Input.EventType.TOUCH_END, this.onGlobalTouch, this);
  }

  private setupCanvasTapListeners(): void {
    this.teardownCanvasTapListeners();

    const canvas = this.findCanvasNode();
    if (!canvas) {
      console.warn('GameCore: Canvas не найден для счётчика тапов');
      return;
    }

    this.canvasTapNode = canvas;
    canvas.on(Node.EventType.TOUCH_START, this.onScreenTap, this);
    canvas.on(Node.EventType.TOUCH_END, this.onScreenTap, this);
  }

  private teardownCanvasTapListeners(): void {
    if (!this.canvasTapNode?.isValid) {
      this.canvasTapNode = null;
      return;
    }

    this.canvasTapNode.off(Node.EventType.TOUCH_START, this.onScreenTap, this);
    this.canvasTapNode.off(Node.EventType.TOUCH_END, this.onScreenTap, this);
    this.canvasTapNode = null;
  }

  private onScreenTap(): void {
    this.registerScreenTap();
  }

  private onGlobalTouch(event: EventTouch): void {
    if (this.isCtaShown) {
      return;
    }

    if (this.isProcessing || this.isSelectFeedbackPlaying) {
      return;
    }

    const touchPos = event.getUILocation();

    // Найти верхнюю доступную букву какой-либо стопки под касанием
    for (const stack of this.stacks) {
      const topLetter = this.getTopLetter(stack);
      if (!topLetter) {
        continue;
      }

      const uiTransform = topLetter.node.getComponent(UITransform);
      if (!uiTransform) {
        continue;
      }

      const worldPos = topLetter.node.worldPosition;
      const size = uiTransform.contentSize;
      const scale = topLetter.node.worldScale;

      const halfW = (size.width * scale.x) / 2;
      const halfH = (size.height * scale.y) / 2;

      if (touchPos.x >= worldPos.x - halfW && touchPos.x <= worldPos.x + halfW &&
          touchPos.y >= worldPos.y - halfH && touchPos.y <= worldPos.y + halfH) {
        this.onStackClicked(stack);
        return;
      }
    }
  }

  /**
   * Получить верхнюю (доступную) букву стопки
   */
  private getTopLetter(stack: LetterStack): StackLetter | null {
    let top: StackLetter | null = null;
    for (const sl of stack.letters) {
      if (sl.taken || !sl.node.isValid) {
        continue;
      }
      if (!top || sl.node.worldPosition.y > top.node.worldPosition.y) {
        top = sl;
      }
    }
    return top;
  }

  /**
   * ГЛАВНЫЙ обработчик клика по стопке.
   * Берёт верхнюю доступную букву стопки.
   */
  private onStackClicked(stack: LetterStack): void {
    if (this.isCtaShown || this.isProcessing || this.isSelectFeedbackPlaying) {
      return;
    }

    const topLetter = this.getTopLetter(stack);
    if (!topLetter) {
      console.log('   ...стопка пуста');
      return;
    }

    console.log(`🖱️ Клик по стопке "${stack.rootNode.name}" → берём букву "${topLetter.letter}"`);
    this.audioController?.playLetterTap();

    // Отметить букву как взятую
    topLetter.taken = true;
    topLetter.bankPlaced = false;

    // Добавить в выбор
    this.selectedLetters.push(topLetter);
    this.refreshHandHintProgress();

    const invalidSelection = this.shouldTriggerFailOnSelection();

    // Отсоединить букву от родителя, чтобы двигалась ТОЛЬКО она
    this.detachLetter(topLetter);

    this.isSelectFeedbackPlaying = true;
    this.playSelectFeedback(topLetter, () => {
      this.isSelectFeedbackPlaying = false;
      if (invalidSelection) {
        console.log(`   ❌ НЕВЕРНАЯ комбинация: "${this.getCurrentWord()}"`);
        this.onWordError();
        return;
      }
      this.moveLetterToWordBank(topLetter);
    });
  }

  /**
   * Отсоединить букву от родителя (сохранив мировую позицию),
   * чтобы перемещение не тянуло за собой детей стопки.
   */
  private detachLetter(sl: StackLetter): void {
    // Сначала спасти детей: если у этой ноды есть дети (буквы под ней),
    // они должны остаться на своих местах в стопке.
    // Перепривязываем детей к исходному родителю стопки перед отсоединением.
    const worldPos = sl.node.worldPosition.clone();
    const worldScale = sl.node.worldScale.clone();

    // Переместить детей обратно в контейнер стопки (сохранив их мировые позиции)
    const childrenCopy = [...sl.node.children];
    childrenCopy.forEach((child: Node) => {
      const childWorldPos = child.worldPosition.clone();
      child.setParent(sl.originalParent, true);
      child.worldPosition = childWorldPos;
    });

    // Теперь отсоединить саму букву в контейнер Letters (верхний уровень)
    sl.node.setParent(this.lettersContainer, true);
    sl.node.worldPosition = worldPos;
    sl.node.worldScale = worldScale;
  }

  private playSelectFeedback(sl: StackLetter, onComplete: () => void): void {
    const node = sl.node;
    const startWorldPos = node.worldPosition.clone();
    const startScale = node.scale.clone();
    const liftedWorldPos = startWorldPos.clone();
    liftedWorldPos.y += this.selectLiftY;
    const pulseScale = new Vec3(
      startScale.x * this.selectPulseScale,
      startScale.y * this.selectPulseScale,
      startScale.z
    );

    Tween.stopAllByTarget(node);
    this.showGlowOnLetter(node);

    tween(node)
      .to(this.selectLiftDuration, { worldPosition: liftedWorldPos, scale: pulseScale }, { easing: 'sineOut' })
      .delay(this.selectHoldDuration)
      .to(this.selectSettleDuration, { worldPosition: startWorldPos, scale: startScale }, { easing: 'sineInOut' })
      .call(() => {
        this.hideGlowEffect();
        onComplete();
      })
      .start();
  }

  private showGlowOnLetter(letterNode: Node): void {
    if (!this.glowEffect || !this.glowEffect.isValid) {
      return;
    }

    Tween.stopAllByTarget(this.glowEffect);
    this.glowEffect.setParent(letterNode, true);
    this.glowEffect.setPosition(0, 0, -1);
    this.glowEffect.active = true;

    const anim = this.glowEffect.getComponent(Animation);
    if (anim) {
      anim.stop();
      anim.play();
    }
  }

  private hideGlowEffect(): void {
    if (!this.glowEffect || !this.glowEffect.isValid) {
      return;
    }

    const anim = this.glowEffect.getComponent(Animation);
    if (anim) {
      anim.stop();
    }

    if (this.glowHomeParent && this.glowHomeParent.isValid) {
      this.glowEffect.setParent(this.glowHomeParent, true);
    }

    this.glowEffect.active = false;
  }

  /**
   * Переместить букву в зону ввода (Word_Bank)
   */
  private moveLetterToWordBank(sl: StackLetter, onComplete?: () => void): void {
    if (!this.wordBank) {
      console.warn('GameCore: wordBank не назначен');
      sl.bankPlaced = true;
      onComplete?.();
      this.onLetterBankPlacementComplete();
      return;
    }

    sl.bankPlaced = false;
    const flyToken = ++this.letterFlyToken;
    const slotNode = this.getFirstFreeWordBankSlot();
    let targetWorldPos: Vec3;
    let targetScale = new Vec3(this.selectScale, this.selectScale, 1);

    if (slotNode) {
      targetWorldPos = slotNode.worldPosition.clone();
      targetScale = this.calculateScaleToFitSlot(sl.node, slotNode);
      this.occupiedWordBankSlots.add(slotNode);
    } else {
      // Fallback на старую формулу, если нужного слота нет
      const slotIndex = this.selectedLetters.length - 1;
      const wordBankWorldPos = this.wordBank.worldPosition;
      targetWorldPos = new Vec3(
        wordBankWorldPos.x - this.wordBankStartOffset + (slotIndex * this.letterSpacing),
        wordBankWorldPos.y,
        wordBankWorldPos.z
      );
    }

    Tween.stopAllByTarget(sl.node);
    this.audioController?.playWordBankItemDrop();

    tween(sl.node)
      .to(this.animDuration, {
        worldPosition: targetWorldPos,
        scale: targetScale
      }, { easing: 'cubicOut' })
      .call(() => {
        if (flyToken !== this.letterFlyToken || !sl.node.isValid) {
          return;
        }

        if (slotNode && slotNode.isValid) {
          // После прилета фиксируем букву в центре слота
          sl.node.setParent(slotNode, true);
          sl.node.setPosition(0, 0, 0);
          sl.node.setSiblingIndex(slotNode.children.length - 1);
          this.playWordBankSettle(sl.node, this.selectedLetters.length - 1, () => {
            this.finishLetterBankPlacement(sl, onComplete);
          });
          return;
        }

        this.finishLetterBankPlacement(sl, onComplete);
      })
      .start();
  }

  private finishLetterBankPlacement(sl: StackLetter, onComplete?: () => void): void {
    sl.bankPlaced = true;
    onComplete?.();
    this.onLetterBankPlacementComplete();
  }

  private onLetterBankPlacementComplete(): void {
    const currentWord = this.getCurrentWord();

    if (this.shouldTriggerFailOnSelection()) {
      if (!this.isProcessing) {
        console.log(`   ❌ НЕВЕРНАЯ комбинация: "${currentWord}"`);
        this.onWordError();
      }
      return;
    }

    if (!this.areAllSelectedLettersPlacedInBank()) {
      const placedCount = this.selectedLetters.filter(sl => sl.bankPlaced).length;
      console.log(`   ⏳ Буквы в банке: ${placedCount}/${this.selectedLetters.length} ("${currentWord}")`);
      return;
    }

    console.log(`   ✓ Все буквы на месте: "${currentWord}"`);
    this.checkWord();
  }

  private getCurrentWord(): string {
    return this.selectedLetters.map((sl: StackLetter) => sl.letter).join('');
  }

  private isInvalidWordSelection(): boolean {
    const currentWord = this.getCurrentWord();
    if (this.validWords.includes(currentWord)) {
      return this.usedWords.has(currentWord);
    }

    return !this.validWords.some((word: string) => word.startsWith(currentWord));
  }

  private shouldTriggerFailOnSelection(): boolean {
    return this.selectedLetters.length >= 3 && this.isInvalidWordSelection();
  }

  private areAllSelectedLettersPlacedInBank(): boolean {
    if (this.selectedLetters.length === 0) {
      return false;
    }

    return this.selectedLetters.every((sl: StackLetter) => {
      return sl.bankPlaced && sl.node.isValid && this.isLetterInWordBankSlot(sl);
    });
  }

  private isLetterInWordBankSlot(sl: StackLetter): boolean {
    const parent = sl.node.parent;
    if (!parent || !parent.isValid) {
      return false;
    }

    if (this.wordBankSlots.includes(parent)) {
      return true;
    }

    return parent.name.toLowerCase().startsWith('slot_');
  }

  private playWordBankSettle(letterNode: Node, slotIndex: number, onComplete?: () => void): void {
    Tween.stopAllByTarget(letterNode);
    letterNode.setPosition(0, 0, 0);
    letterNode.setRotationFromEuler(0, 0, 0);

    const rotateDir = slotIndex % 2 === 0 ? 1 : -1;
    const restPos = new Vec3(0, 0, 0);
    const restEuler = new Vec3(0, 0, 0);
    const mainLift = new Vec3(0, this.bankSettleLiftY, 0);
    const secondLift = new Vec3(0, this.bankSettleLiftY * this.bankSettleSecondBounceRatio, 0);
    const tiltEuler = new Vec3(0, 0, this.bankSettleRotateZ * rotateDir);
    const halfTiltEuler = new Vec3(0, 0, this.bankSettleRotateZ * rotateDir * 0.35);

    const up1 = this.getBankSettleDuration(this.bankSettleUpDuration);
    const down1 = this.getBankSettleDuration(this.bankSettleDownDuration);
    const up2 = this.getBankSettleDuration(this.bankSettleUpDuration * 0.55);
    const down2 = this.getBankSettleDuration(this.bankSettleDownDuration * 0.45);

    tween(letterNode)
      .to(up1, { position: mainLift, eulerAngles: tiltEuler }, { easing: 'quadOut' })
      .to(down1, { position: restPos, eulerAngles: halfTiltEuler }, { easing: 'bounceOut' })
      .to(up2, { position: secondLift, eulerAngles: halfTiltEuler }, { easing: 'quadOut' })
      .to(down2, { position: restPos, eulerAngles: restEuler }, { easing: 'sineIn' })
      .call(() => onComplete?.())
      .start();
  }

  private getBankSettleDuration(baseDuration: number): number {
    const speed = Math.max(0.1, this.bankSettlePlaybackSpeed);
    return baseDuration / speed;
  }

  private getFirstFreeWordBankSlot(): Node | null {
    for (const slot of this.wordBankSlots) {
      if (!this.occupiedWordBankSlots.has(slot)) {
        return slot;
      }
    }
    return null;
  }

  private calculateScaleToFitSlot(letterNode: Node, slotNode: Node): Vec3 {
    const letterUI = letterNode.getComponent(UITransform);
    const slotUI = slotNode.getComponent(UITransform);
    if (!letterUI || !slotUI) {
      return new Vec3(this.selectScale, this.selectScale, 1);
    }

    const slotWorldW = slotUI.contentSize.width * slotNode.worldScale.x;
    const slotWorldH = slotUI.contentSize.height * slotNode.worldScale.y;

    const letterWorldW = letterUI.contentSize.width * letterNode.worldScale.x;
    const letterWorldH = letterUI.contentSize.height * letterNode.worldScale.y;

    if (letterWorldW <= 0 || letterWorldH <= 0) {
      return new Vec3(this.selectScale, this.selectScale, 1);
    }

    const fill = Math.max(0.01, this.slotFillPercent);
    const fitFactor = Math.min(slotWorldW / letterWorldW, slotWorldH / letterWorldH) * fill;
    const minScale = Math.max(0.01, this.slotScaleMin);
    const maxScale = Math.max(minScale, this.slotScaleMax);
    const clampedFactor = Math.min(Math.max(fitFactor, minScale), maxScale);

    return new Vec3(
      letterNode.scale.x * clampedFactor,
      letterNode.scale.y * clampedFactor,
      letterNode.scale.z
    );
  }

  /**
   * Проверить составлено ли валидное слово
   */
  private checkWord(): void {
    const currentWord = this.getCurrentWord();

    if (this.shouldTriggerFailOnSelection()) {
      console.log(`   ❌ НЕВЕРНАЯ комбинация: "${currentWord}"`);
      this.onWordError();
      return;
    }

    if (this.validWords.includes(currentWord)) {
      console.log(`   ✅ ПРАВИЛЬНОЕ СЛОВО: "${currentWord}"`);
      this.onWordSuccess(currentWord);
      return;
    }

    console.log(`   ⏳ "${currentWord}" - возможное начало слова`);
  }

  /**
   * Слово собрано правильно
   */
  private onWordSuccess(word: string): void {
    if (!this.areAllSelectedLettersPlacedInBank()) {
      console.log(`   ⏳ Ждём все буквы в банке перед успехом: "${word}"`);
      return;
    }

    this.isProcessing = true;
    this.usedWords.add(word);
    if (word === 'APPLE') {
      this.stopHandHint();
    }

    const letters = [...this.selectedLetters];
    const crateNode = this.findCrateByWord(word);

    if (!crateNode || letters.length === 0) {
      this.showStampByWord(word);
      this.hideSelectedLetters();
      this.clearSelection();
      this.isProcessing = false;
      return;
    }

    this.showEffectGold();

    this.scheduleOnce(() => {
      this.playWordBounce(letters, () => {
        this.scheduleOnce(() => {
          this.prepareLettersForCrateFlight(letters);
          this.playWordSuccessCrateSequence(word, letters, crateNode);
        }, this.wordSuccessPostBounceDelay);
      });
    }, this.wordSuccessPreDelay);
  }

  private playWordBounce(letters: StackLetter[], onComplete: () => void): void {
    if (letters.length === 0) {
      onComplete();
      return;
    }

    this.audioController?.playReadyWord();

    let completed = 0;
    const total = letters.length;

    letters.forEach((sl: StackLetter) => {
      const node = sl.node;
      if (!node.isValid) {
        if (++completed >= total) {
          onComplete();
        }
        return;
      }

      Tween.stopAllByTarget(node);
      const restPos = node.position.clone();
      const liftPos = new Vec3(restPos.x, restPos.y + this.wordBounceLiftY, restPos.z);

      tween(node)
        .to(this.wordBounceUpDuration, { position: liftPos }, { easing: 'quadOut' })
        .to(this.wordBounceDownDuration, { position: restPos }, { easing: 'bounceOut' })
        .call(() => {
          if (++completed >= total) {
            onComplete();
          }
        })
        .start();
    });
  }

  private getWordAliases(word: string): string[] {
    const upper = word.toUpperCase();
    if (upper === 'MELON') {
      return ['MELON', 'WATERMELON'];
    }
    if (upper === 'WATERMELON') {
      return ['WATERMELON', 'MELON'];
    }
    return [upper];
  }

  private findCrateByWord(word: string): Node | null {
    if (!this.cratesContainer) {
      return null;
    }

    const targets = this.getWordAliases(word).map((w) => w.toLowerCase());
    for (const crateRoot of this.cratesContainer.children) {
      if (targets.some((target) => this.nodeContainsName(crateRoot, target))) {
        return crateRoot;
      }
    }

    return null;
  }

  private nodeContainsName(node: Node, nameLower: string): boolean {
    if (node.name.toLowerCase() === nameLower) {
      return true;
    }

    for (const child of node.children) {
      if (this.nodeContainsName(child, nameLower)) {
        return true;
      }
    }

    return false;
  }

  private prepareLettersForCrateFlight(letters: StackLetter[]): void {
    this.hideEffectGold();

    const flightLayer = this.getLettersFlightLayer();

    letters.forEach((sl: StackLetter, index: number) => {
      Tween.stopAllByTarget(sl.node);
      const worldPos = sl.node.worldPosition.clone();
      const worldScale = sl.node.worldScale.clone();
      sl.node.setParent(flightLayer, true);
      sl.node.worldPosition = worldPos;
      sl.node.worldScale = worldScale;
      sl.node.setRotationFromEuler(0, 0, 0);
      sl.node.setSiblingIndex(index);
    });

    this.bringLettersFlightLayerToFront();
    this.occupiedWordBankSlots.clear();
  }

  private getLettersFlightLayer(): Node {
    if (this.lettersFlightLayer && this.lettersFlightLayer.isValid) {
      return this.lettersFlightLayer;
    }

    const canvas = this.findCanvasNode();
    let layer = canvas.getChildByName('LettersFlightLayer');
    if (!layer) {
      layer = new Node('LettersFlightLayer');
      layer.layer = this.lettersContainer ? this.lettersContainer.layer : canvas.layer;
      layer.setParent(canvas);
    }

    this.lettersFlightLayer = layer;
    this.bringLettersFlightLayerToFront();
    return layer;
  }

  private bringLettersFlightLayerToFront(): void {
    const layer = this.lettersFlightLayer;
    if (!layer || !layer.isValid || !layer.parent) {
      return;
    }

    layer.setSiblingIndex(layer.parent.children.length - 1);

    // Fail должен оставаться поверх слоя полёта букв при возврате после ошибки
    if (this.failEffect?.active) {
      this.bringFailEffectToFront();
    }
  }

  private findCanvasNode(): Node {
    let node: Node | null = this.lettersContainer ?? this.node;
    while (node) {
      if (node.name === 'Canvas') {
        return node;
      }
      node = node.parent;
    }

    return this.lettersContainer ?? this.node;
  }

  private playWordSuccessCrateSequence(word: string, letters: StackLetter[], crateNode: Node): void {
    const token = ++this.crateSequenceToken;
    const crateWorld = crateNode.worldPosition.clone();
    const hoverScale = this.getCrateHoverScale(letters.length);
    const flyScale = new Vec3(hoverScale, hoverScale, 1);
    let completedFlies = 0;

    this.audioController?.playCrateFlightWoosh();

    letters.forEach((sl: StackLetter, index: number) => {
      const targetPos = new Vec3(
        crateWorld.x,
        this.getCrateHoverWorldY(crateWorld.y, index, letters.length),
        crateWorld.z
      );

      this.scheduleOnce(() => {
        if (token !== this.crateSequenceToken) {
          return;
        }

        tween(sl.node)
          .to(this.crateFlyDuration, {
            worldPosition: targetPos,
            scale: flyScale,
            eulerAngles: new Vec3(0, 0, 0)
          }, { easing: 'cubicOut' })
          .call(() => {
            if (token !== this.crateSequenceToken) {
              return;
            }

            completedFlies++;
            if (completedFlies >= letters.length) {
              this.scheduleOnce(() => {
                if (token !== this.crateSequenceToken) {
                  return;
                }

                this.placeLettersInsideCrate(crateNode, letters);
                this.dropLettersIntoCrate(word, letters, crateNode, letters.length - 1, token);
              }, this.crateHoverHoldDuration);
            }
          })
          .start();
      }, index * this.crateFlyStagger);
    });
  }

  private getCrateHoverScale(letterCount: number): number {
    let scale = this.crateFlyScale;

    if (letterCount > 10) {
      scale *= this.crateLongWordScaleFactor * 0.75;
    } else if (letterCount > 8) {
      scale *= this.crateLongWordScaleFactor * 0.85;
    } else if (letterCount > 6) {
      scale *= this.crateLongWordScaleFactor;
    } else if (letterCount > 5) {
      scale *= 0.92;
    }

    return Math.max(0.2, scale);
  }

  private getCrateHoverWorldY(crateWorldY: number, index: number, letterCount: number): number {
    let baseOffset = this.crateHoverOffsetY;
    let stackStep = this.crateStackOffsetY;

    if (letterCount > 8) {
      baseOffset *= 0.7;
      stackStep *= 0.55;
    } else if (letterCount > 6) {
      baseOffset *= 0.82;
      stackStep *= 0.7;
    } else if (letterCount > 5) {
      baseOffset *= 0.9;
      stackStep *= 0.85;
    }

    return crateWorldY + baseOffset + index * stackStep;
  }

  private findCrateFruitBg(crateNode: Node): Node | null {
    for (const child of crateNode.children) {
      if (child.name.startsWith('Fruit_BG')) {
        return child;
      }
    }

    return crateNode.children.find((child) => child.name.toLowerCase().includes('fruit')) ?? null;
  }

  private placeLettersInsideCrate(crateNode: Node, letters: StackLetter[]): void {
    const fruitBg = this.findCrateFruitBg(crateNode);

    letters.forEach((sl: StackLetter) => {
      if (!sl.node.isValid) {
        return;
      }

      Tween.stopAllByTarget(sl.node);
      const worldPos = sl.node.worldPosition.clone();
      const worldScale = sl.node.worldScale.clone();
      sl.node.setParent(crateNode, true);
      sl.node.worldPosition = worldPos;
      sl.node.worldScale = worldScale;
    });

    letters.forEach((sl: StackLetter, index: number) => {
      if (sl.node.isValid) {
        sl.node.setSiblingIndex(index);
      }
    });

    if (!fruitBg?.isValid) {
      return;
    }

    fruitBg.setSiblingIndex(letters.length);

    let nextIndex = letters.length + 1;
    for (const child of crateNode.children) {
      if (child === fruitBg || letters.some((sl) => sl.node === child)) {
        continue;
      }

      child.setSiblingIndex(nextIndex++);
    }
  }

  private dropLettersIntoCrate(
    word: string,
    letters: StackLetter[],
    crateNode: Node,
    index: number,
    token: number
  ): void {
    if (token !== this.crateSequenceToken) {
      return;
    }

    if (index < 0) {
      this.showStampByWord(word);
      this.hideSelectedLetters();
      this.clearSelection();
      this.isProcessing = false;
      return;
    }

    const sl = letters[index];
    const crateWorld = crateNode.worldPosition.clone();
    const dropPos = new Vec3(
      crateWorld.x,
      crateWorld.y + this.crateDropOffsetY,
      crateWorld.z
    );

    tween(sl.node)
      .to(this.crateDropDuration, {
        worldPosition: dropPos,
      }, { easing: 'quadIn' })
      .call(() => {
        if (token !== this.crateSequenceToken) {
          return;
        }

        this.audioController?.playDropCreat();
        sl.node.active = false;
        this.scheduleOnce(() => {
          this.dropLettersIntoCrate(word, letters, crateNode, index - 1, token);
        }, this.crateDropStagger);
      })
      .start();
  }

  /**
   * Слово собрано неправильно - вернуть буквы в стопки
   */
  private onWordError(): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.letterFlyToken++;
    this.crateSequenceToken++;
    this.isSelectFeedbackPlaying = false;
    this.hideGlowEffect();
    this.hideEffectGold();
    this.audioController?.stopItemDropLoop();

    this.selectedLetters.forEach((sl: StackLetter) => {
      Tween.stopAllByTarget(sl.node);
    });

    this.showFailEffect();

    this.scheduleOnce(() => {
      this.returnLettersToStacks();
      this.clearSelection();
      this.refreshHandHintProgress();
      this.isProcessing = false;
    }, 0.4);
  }

  /**
   * Спрятать выбранные буквы (при успехе - они "проданы")
   */
  private hideSelectedLetters(): void {
    this.selectedLetters.forEach((sl: StackLetter) => {
      sl.node.active = false;
    });
  }

  /**
   * Вернуть выбранные буквы обратно в стопки (при ошибке)
   */
  private returnLettersToStacks(): void {
    const flightLayer = this.getLettersFlightLayer();
    this.bringLettersFlightLayerToFront();

    this.selectedLetters.forEach((sl: StackLetter) => {
      Tween.stopAllByTarget(sl.node);

      if (!sl.originalParent || !sl.originalParent.isValid) {
        sl.taken = false;
        sl.bankPlaced = false;
        return;
      }

      const startWorldPos = sl.node.worldPosition.clone();
      const startWorldScale = sl.node.worldScale.clone();
      const targetWorldPos = this.getLetterStackWorldPos(sl);

      sl.node.setParent(flightLayer, true);
      sl.node.worldPosition = startWorldPos;
      sl.node.worldScale = startWorldScale;
      sl.node.setRotationFromEuler(0, 0, 0);

      tween(sl.node)
        .to(this.animDuration, {
          worldPosition: targetWorldPos,
        }, { easing: 'sineInOut' })
        .call(() => {
          sl.node.setParent(sl.originalParent, true);
          sl.node.position = sl.originalPos;
          sl.node.scale = sl.originalScale;
          sl.node.setRotationFromEuler(0, 0, 0);
          sl.node.setSiblingIndex(this.getLetterReturnSiblingIndex(sl));
        })
        .start();

      sl.taken = false;
      sl.bankPlaced = false;
    });
  }

  private getLetterStackWorldPos(sl: StackLetter): Vec3 {
    const parentUI = sl.originalParent.getComponent(UITransform);
    if (parentUI) {
      return parentUI.convertToWorldSpaceAR(sl.originalPos);
    }

    return sl.originalWorldPos.clone();
  }

  private getLetterReturnSiblingIndex(sl: StackLetter): number {
    const parent = sl.originalParent;
    if (!parent?.isValid) {
      return sl.originalSiblingIndex;
    }

    return Math.min(sl.originalSiblingIndex, Math.max(0, parent.children.length));
  }

  /**
   * Показать штамп на ящике
   */
  private showStampByWord(word: string): void {
    // Ищем штамп по имени, содержащему слово (например "Stamp_GRAPE" или "GRAPE")
    const aliases = this.getWordAliases(word);
    const stamp = this.stampNodes.find((s) =>
      s && aliases.some((alias) => s.name.toUpperCase().includes(alias))
    );
    
    if (!stamp) {
      console.warn(`   ⚠️ Штамп для слова "${word}" не найден среди ${this.stampNodes.length} штампов`);
      // Вывести имена всех штампов для отладки
      this.stampNodes.forEach((s, i) => {
        if (s) console.log(`      Штамп[${i}]: "${s.name}"`);
      });
      return;
    }

    this.resetStampVisual(stamp);
    stamp.active = true;
    this.audioController?.playSoldOut();

    const anim = this.getStampAnimation(stamp);
    if (anim) {
      anim.play('SoldOutScale');
    }

    console.log(`   🏷️ Штамп "${stamp.name}" показан для слова "${word}"`);
  }

  /**
   * Показать эффект ошибки
   */
  private bringFailEffectToFront(): void {
    if (!this.failEffect?.isValid) {
      return;
    }

    const canvas = this.findCanvasNode();
    if (!canvas) {
      return;
    }

    if (!this.failEffectHomeParent?.isValid) {
      this.failEffectHomeParent = this.failEffect.parent;
      this.failEffectHomeSiblingIndex = this.failEffect.getSiblingIndex();
    }

    const worldPos = this.failEffect.worldPosition.clone();
    const worldScale = this.failEffect.worldScale.clone();

    if (this.failEffect.parent !== canvas) {
      this.failEffect.setParent(canvas, true);
    }

    this.failEffect.worldPosition = worldPos;
    this.failEffect.worldScale = worldScale;
    this.failEffect.setSiblingIndex(canvas.children.length - 1);
  }

  private restoreFailEffectHome(): void {
    if (!this.failEffect?.isValid || !this.failEffectHomeParent?.isValid) {
      return;
    }

    if (this.failEffect.parent === this.failEffectHomeParent) {
      this.failEffect.setSiblingIndex(this.failEffectHomeSiblingIndex);
      return;
    }

    const worldPos = this.failEffect.worldPosition.clone();
    const worldScale = this.failEffect.worldScale.clone();
    this.failEffect.setParent(this.failEffectHomeParent, true);
    this.failEffect.worldPosition = worldPos;
    this.failEffect.worldScale = worldScale;
    this.failEffect.setSiblingIndex(this.failEffectHomeSiblingIndex);
  }

  private showFailEffect(): void {
    if (!this.failEffect) {
      return;
    }

    this.unschedule(this.hideFailEffect);
    this.resetFailVisual();
    this.bringFailEffectToFront();
    this.failEffect.active = true;
    this.audioController?.playFailWrong();
    this.playFailAnimation();

    console.log('   💥 Эффект ошибки показан');
  }

  private hideFailEffect(): void {
    if (!this.failEffect || !this.failEffect.isValid) {
      return;
    }

    this.resetFailVisual();
    this.failEffect.active = false;
    this.restoreFailEffectHome();
  }

  /**
   * Настроить штампы (спрятать) и вывести диагностику
   */
  private setupStamps(): void {
    console.log('\n📋 Штампы (ищем по имени слова):');
    this.stampNodes.forEach((stamp: Node, index: number) => {
      if (stamp) {
        stamp.active = false;
        this.resetStampVisual(stamp);
        // Определить какое слово соответствует этому штампу по имени
        const matchedWord = this.validWords.find(w => stamp.name.toUpperCase().includes(w));
        console.log(`  Штамп[${index}] "${stamp.name}" → слово "${matchedWord || '?'}"`);
      }
    });
  }

  private getStampAnimation(stamp: Node): Animation | null {
    return stamp.getComponent(Animation) ?? stamp.getComponentInChildren(Animation);
  }

  private getStampVisualNode(stamp: Node): Node | null {
    const anim = this.getStampAnimation(stamp);
    return anim ? anim.node : stamp;
  }

  private resetStampVisual(stamp: Node): void {
    const visualNode = this.getStampVisualNode(stamp);
    const anim = this.getStampAnimation(stamp);
    if (!visualNode) {
      return;
    }

    anim?.stop();
    visualNode.setScale(0, 0, 1);
  }

  /**
   * Очистить текущий выбор
   */
  private clearSelection(): void {
    this.selectedLetters.forEach((sl: StackLetter) => {
      sl.bankPlaced = false;
    });
    this.selectedLetters = [];
    this.occupiedWordBankSlots.clear();
  }
}
