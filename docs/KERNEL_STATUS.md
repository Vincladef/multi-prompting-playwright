# Kernel — état vérifié au 28 octobre 2026

## Éléments confirmés
- Profil Kernel `multi-prompting` créé, authentifié manuellement à ChatGPT, fermé avec sauvegarde et réouvert dans une nouvelle session authentifiée.
- [GitHub Action 40668999952](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40668999952) : navigateur Kernel créé, CDP Playwright connecté, page publique et interface ChatGPT authentifiée reconnues, nettoyage terminé.
- Nouveau moteur `src/kernel-sequence.mjs`, workflow `kernel-sequence.yml`, plugin indépendant `Multi-Prompting Kernel` : https://chatgpt.com/plugins/plugins_6ae1c9a72a94819181afc5a91d29e1f7.

## Limite réelle — ne pas confondre avec une réussite
- [Run 40669823018](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40669823018) : échec de découverte du fichier de requête GitHub, **0 envoi** ; corrigé par `fetch-depth: 2`.
- [Run 40669951996](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40669951996) : sélecteur du composeur absent, **0 envoi**.
- [Run 40670170815](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40670170815) : composeur reconnu, bouton d'envoi introuvable, **0 envoi**.
- [Run 40670535583](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40670535583) : **1 tentative d'envoi**, **0 réponse confirmée** : état **ambigu**, aucune relance.
- [Run 40671017043](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40671017043) : champ transitoirement absent, **0 envoi** ; attente de disponibilité renforcée.

Le diagnostic [40670838406](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40670838406) a confirmé un composeur `DIV[role=textbox]` et un bouton `button[aria-label=Send][type=submit]`. Le diagnostic [40671205532](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40671205532) a constaté dans une conversation réelle que les anciens attributs `data-message-author-role` et `conversation-turn` étaient absents. Aucune réponse n'a été extraite.

**L'enchaînement automatique réel de plusieurs prompts n'est donc PAS VALIDÉ.** Le moteur est conçu pour s'arrêter en état ambigu plutôt que risquer un envoi en double.

## Sécurité et confidentialité
- Dépôt PUBLIC : fichiers `requests/kernel-*.json` et prompts publiquement lisibles. N'y placer aucun message privé ou confidentiel.
- `KERNEL_API_KEY` est un secret GitHub Actions, absent du code.
- Aucun contournement de protection, CAPTCHA, extraction de sortie, screenshot, cookie ou JWT dans les journaux.
- Les conditions d'utilisation de ChatGPT doivent être respectées, en particulier l'interdiction d'extraction automatisée de données et de sortie.

## Étape restante
Trouver, puis tester un signal fiable de fin de génération fondé sur l'interface actuelle, sans lire le contenu des réponses. Tester d'abord sur une nouvelle séquence explicite, en évitant de rejouer un run ambigu.
