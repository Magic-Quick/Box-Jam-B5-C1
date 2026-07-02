import { _decorator, Component, Node, EventTouch, UITransform, Vec3, tween, Animation, CCFloat, Input, input } from 'cc';
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
  taken: boolean;      // взята ли буква
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

  // ===== ВНУТРЕННИЕ ДАННЫЕ =====

  // Список валидных слов
  private validWords: string[] = ['GRAPE', 'LEMON', 'PEACH', 'APPLE', 'WATERMELON', 'MANGO'];

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

  start() {
    console.log('═══════════════════════════════════');
    console.log('🎮 GameCore: запуск игры (режим стопок)');
    console.log('═══════════════════════════════════');
    this.buildStacks();
    this.setupStamps();
    this.collectWordBankSlots();
    this.setupGlobalInput();
    console.log('✓ GameCore: игра готова, кликайте на стопки!');
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

      const order = stack.letters.map(l => `${l.letter}(d${l.depth},z${l.node.position.z.toFixed(0)})`).join(' → ');
      console.log(`  Стопка[${stackIndex}] "${rootNode.name}": порядок взятия ${order}`);
    });

    console.log(`GameCore: построено ${this.stacks.length} стопок`);
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
      taken: false
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
   * Глобальный слушатель (резервный) - определяет стопку по координатам
   */
  private setupGlobalInput(): void {
    input.on(Input.EventType.TOUCH_END, this.onGlobalTouch, this);
  }

  private onGlobalTouch(event: EventTouch): void {
    if (this.isProcessing) {
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
    for (const sl of stack.letters) {
      if (!sl.taken) {
        return sl;
      }
    }
    return null;
  }

  /**
   * ГЛАВНЫЙ обработчик клика по стопке.
   * Берёт верхнюю доступную букву стопки.
   */
  private onStackClicked(stack: LetterStack): void {
    if (this.isProcessing) {
      return;
    }

    const topLetter = this.getTopLetter(stack);
    if (!topLetter) {
      console.log('   ...стопка пуста');
      return;
    }

    console.log(`🖱️ Клик по стопке "${stack.rootNode.name}" → берём букву "${topLetter.letter}"`);

    // Отметить букву как взятую
    topLetter.taken = true;

    // Добавить в выбор
    this.selectedLetters.push(topLetter);

    // Отсоединить букву от родителя, чтобы двигалась ТОЛЬКО она
    this.detachLetter(topLetter);

    // Переместить в Word_Bank
    this.moveLetterToWordBank(topLetter);

    const currentWord = this.selectedLetters.map(l => l.letter).join('');
    console.log(`   ✓ Текущее слово: "${currentWord}"`);

    // Проверить слово
    this.checkWord();
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

  /**
   * Переместить букву в зону ввода (Word_Bank)
   */
  private moveLetterToWordBank(sl: StackLetter): void {
    if (!this.wordBank) {
      console.warn('GameCore: wordBank не назначен');
      return;
    }

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

    tween(sl.node)
      .to(this.animDuration, {
        worldPosition: targetWorldPos,
        scale: targetScale
      })
      .call(() => {
        if (slotNode && slotNode.isValid) {
          // После прилета фиксируем букву в центре слота
          sl.node.setParent(slotNode, true);
          sl.node.setPosition(0, 0, 0);
        }
      })
      .start();
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
    const currentWord = this.selectedLetters.map(l => l.letter).join('');

    // Проверить точное совпадение со словом
    if (this.validWords.includes(currentWord)) {
      if (this.usedWords.has(currentWord)) {
        console.log(`   ⚠️ Слово "${currentWord}" уже использовано`);
        this.onWordError();
      } else {
        console.log(`   ✅ ПРАВИЛЬНОЕ СЛОВО: "${currentWord}"`);
        this.onWordSuccess(currentWord);
      }
      return;
    }

    // Проверить является ли началом какого-то слова
    const isPrefix = this.validWords.some(w => w.startsWith(currentWord));

    if (!isPrefix) {
      console.log(`   ❌ НЕВЕРНАЯ комбинация: "${currentWord}"`);
      this.onWordError();
    } else {
      console.log(`   ⏳ "${currentWord}" - возможное начало слова`);
    }
  }

  /**
   * Слово собрано правильно
   */
  private onWordSuccess(word: string): void {
    this.isProcessing = true;

    this.usedWords.add(word);
    this.showStampByWord(word);

    // Буквы остаются "проданными" - не возвращаются, но выбор очищается
    this.scheduleOnce(() => {
      this.hideSelectedLetters();
      this.clearSelection();
      this.isProcessing = false;
    }, 0.5);
  }

  /**
   * Слово собрано неправильно - вернуть буквы в стопки
   */
  private onWordError(): void {
    this.isProcessing = true;

    this.showFailEffect();

    this.scheduleOnce(() => {
      this.returnLettersToStacks();
      this.clearSelection();
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
    this.selectedLetters.forEach((sl: StackLetter) => {
      // Вернуть в исходный родитель
      sl.node.setParent(sl.originalParent, true);

      // Анимация возврата с тряской
      tween(sl.node)
        .to(this.animDuration, {
          worldPosition: sl.originalWorldPos,
          scale: sl.originalScale
        })
        .call(() => {
          sl.node.position = sl.originalPos;
          sl.node.scale = sl.originalScale;
        })
        .start();

      // Снять пометку "взята"
      sl.taken = false;
    });
  }

  /**
   * Показать штамп на ящике
   */
  private showStampByWord(word: string): void {
    // Ищем штамп по имени, содержащему слово (например "Stamp_GRAPE" или "GRAPE")
    const stamp = this.stampNodes.find(s => s && s.name.toUpperCase().includes(word));
    
    if (!stamp) {
      console.warn(`   ⚠️ Штамп для слова "${word}" не найден среди ${this.stampNodes.length} штампов`);
      // Вывести имена всех штампов для отладки
      this.stampNodes.forEach((s, i) => {
        if (s) console.log(`      Штамп[${i}]: "${s.name}"`);
      });
      return;
    }

    stamp.active = true;

    const anim = stamp.getComponent(Animation);
    if (anim) {
      anim.play();
    }

    console.log(`   🏷️ Штамп "${stamp.name}" показан для слова "${word}"`);
  }

  /**
   * Показать эффект ошибки
   */
  private showFailEffect(): void {
    if (!this.failEffect) {
      return;
    }

    this.failEffect.active = true;

    const anim = this.failEffect.getComponent(Animation);
    if (anim) {
      anim.play();
    }

    this.scheduleOnce(() => {
      if (this.failEffect) {
        this.failEffect.active = false;
      }
    }, 1);

    console.log('   💥 Эффект ошибки показан');
  }

  /**
   * Настроить штампы (спрятать) и вывести диагностику
   */
  private setupStamps(): void {
    console.log('\n📋 Штампы (ищем по имени слова):');
    this.stampNodes.forEach((stamp: Node, index: number) => {
      if (stamp) {
        stamp.active = false;
        // Определить какое слово соответствует этому штампу по имени
        const matchedWord = this.validWords.find(w => stamp.name.toUpperCase().includes(w));
        console.log(`  Штамп[${index}] "${stamp.name}" → слово "${matchedWord || '?'}"`);
      }
    });
  }

  /**
   * Очистить текущий выбор
   */
  private clearSelection(): void {
    this.selectedLetters = [];
    this.occupiedWordBankSlots.clear();
  }
}
