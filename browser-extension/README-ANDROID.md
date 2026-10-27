# Multi-Prompting — utilisation sur Android

**Statut au 27 octobre 2026 :** moteur déterministe, testé en Chromium sur interface de conversation simulée. Aucun test de bout en bout sur un téléphone Android connecté à ChatGPT n'a encore été confirmé.

## Navigateur compatible

Chrome Android et l'application officielle ChatGPT Android ne peuvent pas charger cette extension.

Pour un premier essai sans ordinateur, installer **Titanium Browser pour Android** depuis son projet officiel :
https://github.com/jqssun/android-titanium-browser

Titanium prend en charge l'installation de fichiers ZIP d'extensions Chromium depuis les options de **Titanium Extension for Android**. Le développeur recommande **Install from file (zip/crx)** plutôt que « Load unpacked » pour éviter certains problèmes de mémoire Android.

Comme c'est un navigateur tiers, vérifier que l'éditeur et la provenance te conviennent avant de t'y connecter à ton compte ChatGPT.

## Installation

1. Télécharger `multi-prompting-android.zip` dans les artefacts du workflow **Construire l'extension déterministe** du dépôt GitHub.
2. Sur le téléphone, ouvrir Titanium Browser puis ses options d'extensions : **Titanium Extension for Android → Options → Install from file (zip/crx)**.
3. Sélectionner le ZIP de l'extension ; vérifier que son nom est **Multi-Prompting déterministe**.
4. Ouvrir `https://chatgpt.com` **dans Titanium** et se connecter normalement à son compte. Ne communiquer aucun cookie, mot de passe ou jeton au plugin.
5. Dans une nouvelle conversation vide, repérer le panneau flottant **Multi-Prompting déterministe**.
6. Saisir des prompts séparés par une ligne contenant exactement `--- PROMPT ---`, puis toucher **Démarrer**.

Exemple :

    Réponds exactement ALPHA.
    --- PROMPT ---
    Quel mot m'as-tu répondu juste avant ? Réponds en un mot.

## Conditions importantes

- Laisser **Titanium ouvert au premier plan** avec l'écran actif pendant toute l'exécution. Le programme essaie de demander un verrouillage d'écran éveillé ; Android peut le refuser.
- En cas de mise en arrière-plan, la séquence s'interrompt par prudence. Elle n'essaie jamais de renvoyer un prompt au statut incertain.
- L'extension suit les indicateurs de génération de l'interface ChatGPT, mais ces indicateurs peuvent évoluer. Les longues réflexions, appels d'outils ou changements du site doivent être vérifiés avant tout usage important.
- La progression n'est pas une preuve formelle du contenu des réponses : le moteur ne collecte pas leur texte.
- Il s'agit d'une extension du navigateur, **pas** du plugin MCP. Le MCP Render ne peut pas résoudre seul la détection de fin de chaque réponse.

## Si le ZIP ne s'installe pas

Dans Titanium : `chrome://extensions` → activer Developer mode → Load unpacked → sélectionner le dossier décompressé contenant `manifest.json` et `content.js`. Le développeur préfère toutefois « Install from file ».
