# Multi-Prompting Kernel — GitHub Actions + Playwright

Séquencer des messages utilisateur **distincts** dans **une seule nouvelle conversation ChatGPT** avec Chromium Kernel distant et un profil authentifié persistant. Aucun agent IA de navigateur, API de modèle, ordinateur ou téléphone local maintenu allumé.

## État vérifié — 28 octobre 2026

- **Connexion distante authentifiée : confirmée** : [test lecture seule](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40668999952).
- **Trois prompts consécutifs : confirmés 3/3** : [workflow live](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40673595092).
- **Prompts chiffrés, deux tours : confirmés 2/2** : [workflow chiffré](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40674400332).
- **Tests unitaires** : DOM sémantique, observateur de mutations, cryptographie authentifiée et anciens tests d'orchestration.
- **Plugin privé** : [Multi-Prompting Kernel 1.1.0](https://chatgpt.com/plugins/plugins_6ae1c9a72a94819181afc5a91d29e1f7).

Le moteur n'extrait jamais le texte des réponses. Une réponse est considérée terminée lorsque de nouveaux contrôles assistant (Copy, Rate response, Regenerate response) apparaissent, que la génération n'est plus active et que le DOM est stable.

## Architecture

1. **ChatGPT / plugin** : chiffre la liste des prompts avec la clé publique du dépôt.
2. **GitHub** : reçoit uniquement un fichier de type requests/kernel-ID.sealed.json contenant le ciphertext ; le commit lance l'Action.
3. **GitHub Actions** : déchiffre en mémoire grâce au secret KERNEL_API_KEY et exécute src/kernel-sequence.mjs.
4. **Kernel** : crée Chromium en chargeant le profil persistant multi-prompting, puis Playwright se connecte via CDP.
5. **Machine à états** : un prompt à la fois, confirmation du message utilisateur et des contrôles de fin de réponse, sans extraction de sortie.
6. **Rapport** : compteurs et statuts uniquement, sans cookie ni URL de conversation privée.

## Sécurité

**Le dépôt est PUBLIC.** Les nouveaux fichiers de requête sont publics, mais les prompts qu'ils contiennent sont chiffrés par X25519 + AES-256-GCM. Les noms, tailles, dates et autres métadonnées GitHub restent visibles. Les anciennes requêtes en clair déjà committées restent historiquement accessibles.

- Clé publique : [keys/kernel-prompt-recipient.json](keys/kernel-prompt-recipient.json).
- Le secret GitHub Actions KERNEL_API_KEY permet de dériver la clé privée, sans exposition du secret dans le dépôt ou les logs.
- Si la clé Kernel change, la clé publique doit être recalculée ; ne pas relancer un run ambigu.
- Aucune extraction de réponses, aucun contournement de CAPTCHA ou de protections.

## Exécution et suivi

[Workflow réel chiffré](https://github.com/Vincladef/multi-prompting-playwright/actions/workflows/kernel-sequence.yml) : déclenchement automatique lorsqu'un nouveau fichier requests/kernel-*.sealed.json est ajouté. Pour fabriquer l'enveloppe, utiliser src/kernel-sealed.mjs (sealRequest) avec la clé publique ou le script de référence du plugin. **Ne jamais committer les prompts en clair.**

Une séquence conserve **un navigateur et une conversation uniques**. Ses statuts sont completed, blocked ou ambiguous. Aucun renvoi automatique n'est autorisé si l'envoi peut avoir eu lieu.

Les anciens workflows run-sequence.yml et chain-sequence.yml concernent des **conversations simulées**, conservées pour la régression. Le moteur réel actuel est src/kernel-sequence.mjs.

## Limites

Le moteur ne vérifie ni la justesse ni le contenu textuel des réponses. La structure du site peut évoluer. Les conversations déjà existantes ne sont pas prises en charge : seule une **nouvelle conversation** est possible. L'URL privée de cette conversation n'est pas journalisée.

Voir [docs/KERNEL_STATUS.md](docs/KERNEL_STATUS.md) pour les résultats exacts.
