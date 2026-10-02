# GutenMorgen v0.4.0 — установка на Arch Linux

Архив собран без верхней папки, поэтому его можно распаковать прямо поверх существующего репозитория.

## Безопасный вариант

```bash
cd /путь/к/GutenMorgen
git status
```

Если есть важные незакоммиченные изменения:

```bash
git add -A
git commit -m "backup before GutenMorgen v0.4"
```

или:

```bash
git stash push -u -m "before GutenMorgen v0.4"
```

Если `unzip` не установлен:

```bash
sudo pacman -S unzip
```

Посмотреть содержимое архива:

```bash
unzip -l ~/Downloads/GutenMorgen_v0.4.0.zip
```

Наложить новую версию поверх текущего репозитория:

```bash
cd /путь/к/GutenMorgen
unzip -o ~/Downloads/GutenMorgen_v0.4.0.zip -d .
```

`-o` означает overwrite:
- файлы с одинаковыми путями заменятся;
- новые файлы добавятся;
- старые файлы, которых нет в архиве, не удаляются;
- README.md и LICENSE сохраняются, потому что архив их не содержит.

Проверка:

```bash
git status
git diff -- src docs
```

## Violentmonkey

Полностью замени содержимое текущего userscript содержимым:

```text
src/GutenMorgen.user.js
```

Сохрани `Ctrl+S`, затем на ChatGPT сделай `Ctrl+Shift+R`.

Открыть GutenMorgen:
- `Ctrl+Alt+G`
- кнопка `GM`
- Violentmonkey → `Open GutenMorgen settings`

Вставить активный Context Profile вручную:
- `Ctrl+Alt+I`
- либо Context → `Inject into composer`

## Если хочется именно удалить старые generated-файлы

Обычный `unzip -o` лишние старые файлы не удаляет — это специально безопасное поведение.

Если в будущем решим полностью пересобирать только `src/`, можно сделать:

```bash
rm -rf src
unzip -o ~/Downloads/GutenMorgen_v0.4.0.zip -d .
```

Не делай `rm -rf ./*` в репозитории.
