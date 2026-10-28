# Multi-Prompting Kernel — résultats vérifiés

Dernière actualisation : 28 octobre 2026.

## Extension en cours de validation : conversation préexistante

Le 28 octobre 2026, le moteur a reçu les modes `existing` et `caller` avec URL ou titre exact chiffrés, attente de fin du tour assistant, protection des brouillons et compteurs relatifs à l'historique. Les tests unitaires et les simulations Playwright passent ; **la recherche native a été validée sur Kernel en lecture seule, sans sélection d'un fil réel ni envoi dans un ancien fil**. Le plugin affiche désormais « Multi-Prompting » en version 1.3.0, mais son slug interne « multi-prompting-kernel » demeure inchangé.

## Réussites confirmées

| Test | Lien | Résultat |
|---|---|---|
| Authentification persistante Kernel depuis GitHub Actions | [40668999952](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40668999952) | Succès, navigateur/CDP/interface identifiés et session nettoyée |
| 3 prompts réels distincts, même conversation | [40673595092](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40673595092) | completed : 3 tentatives, 3 messages confirmés, 3 réponses terminées |
| 2 prompts chiffrés de bout en bout | [40674400332](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40674400332) | completed : 2/2, déchiffrement en mémoire, nettoyage réussi |
| Tests CI | [Actions](https://github.com/Vincladef/multi-prompting-playwright/actions) | Tests DOM, MutationObserver et cryptographie réussis |

Le moteur réel utilise src/kernel-sequence.mjs avec le détecteur src/kernel-dom.mjs. Les indicateurs DOM effectivement observés côté utilisateur sont Edit message et Copy message ; côté assistant terminé : Copy, Rate response et Regenerate response. La fin de réponse exige également absence de génération active et stabilité des mutations de la conversation. Le contenu textuel des réponses n'est jamais extrait.

## Historique des échecs antérieurs, résolus

- [40669823018](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40669823018) : fichier GitHub introuvable au premier essai, 0 message.
- [40669951996](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40669951996) : ancien sélecteur de champ absent, 0 message.
- [40670170815](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40670170815) : ancien sélecteur du bouton absent, 0 message.
- [40670535583](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40670535583) : une tentative d'envoi, réponse non confirmée par l'ancienne logique. Non rejouée.
- [40671017043](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40671017043) : ancien problème de disponibilité transitoire du composeur.
- [40674250797](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40674250797) : YAML invalide pendant la migration au stockage chiffré, **aucun prompt envoyé**. Corrigé, puis test chiffré 2/2 réussi.

Les diagnostics en lecture seule [40670838406](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40670838406) et [40673232775](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40673232775) ont identifié les contrôles HTML actuels. Le site n'expose plus les anciens data-message-author-role dans l'interface testée.

## Confidentialité

Le dépôt GitHub est public. Les requêtes futures sont exclusivement des enveloppes .sealed.json, chiffrées via une clé publique X25519 et AES-256-GCM ; le déchiffrement s'effectue dans GitHub Actions à partir du secret KERNEL_API_KEY, dérivé avec séparation cryptographique HKDF. Les prompts ne sont ni imprimés ni déposés en clair. Les métadonnées des fichiers restent publiques et les anciennes requêtes en clair restent présentes dans l'historique.

Le plugin ChatGPT privé [Multi-Prompting Kernel](https://chatgpt.com/plugins/plugins_6ae1c9a72a94819181afc5a91d29e1f7) est en version 1.3.0 avec les instructions de chiffrement et de lancement.

## Limites maintenues

- Mode nouveau fil validé en réel ; recherche native d'un titre absent validée sur Kernel, sans test de sélection positive d'un fil existant. L'URL ou le titre du fil appelant ne sont pas automatiquement fournis par l'API du plugin.
- Le moteur ne vérifie pas le contenu des réponses et n'en extrait pas automatiquement le texte.
- Un changement futur du DOM peut casser la détection ; ne pas réémettre automatiquement un prompt ayant pu être envoyé.
- Respect des conditions d'utilisation, authentification et contrôles de sécurité ; aucun contournement de protections.

## Recherche par titre exact : vérification à effectuer

Branche `feat/kernel-existing-chat-title-lookup` : connexion du module de recherche au moteur, titre chiffré, vérification des résultats uniques et support des historiques à compteurs divergents. Le plugin doit obtenir un titre fiable : le navigateur distant ne peut pas deviner quelle conversation invoque le plugin. Les tests Playwright simulés et la CI doivent être vérifiés sur la branche ; un test réel Kernel sur un fil existant reste distinct et nécessaire avant de déclarer cette fonction validée en production.

## Vérification Kernel de la recherche (lecture seule)

- [Action 40681526607](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40681526607) : champ de recherche introuvable après le raccourci seul ; aucune écriture.
- [Action 40681813090](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40681813090) : identification du bouton visible `Search` ; aucune écriture.
- [Action 40681922748](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40681922748) : fenêtre ouverte, champ `combobox` et placeholder `Search…` identifiés ; aucune écriture.
- [Action 40682023141](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40682023141) : **completed**, recherche d'un titre volontairement absent, clôture de session Kernel réussie ; zéro message envoyé.

Cette validation prouve l'accès à la recherche et le traitement sûr d'un titre absent. Elle ne prouve pas encore la bonne sélection d'un résultat réel ni l'enchaînement de prompts dans un fil historique.
