# Multi-Prompting Kernel — GitHub Actions + Playwright

## Utilisation recommandée (plugin 1.5.0)

- **Si la demande contient déjà les prompts numérotés**, les conserver mot pour mot et lancer la séquence directement dans **une nouvelle discussion**.
- **Sinon**, afficher un formulaire interactif : un champ par prompt, ajout/suppression/réorganisation possible, puis un bouton « Lancer la séquence ». Le bouton envoie la liste préparée dans une nouvelle requête de conversation ; l'assistant déclenche alors le workflow chiffré.
- **Pas de plafond fixe de 20 prompts** : le moteur valide des messages non vides de 10 000 caractères maximum chacun et une charge totale de **250 000 octets UTF-8** avant chiffrement. Le volume réellement exécutable demeure limité par la session Kernel et le job GitHub Actions (actuellement 180 minutes) ; aucune reprise automatique d'une séquence interrompue.
- Le moteur ne lit pas le texte des réponses et ne construit pas de branches conditionnelles à partir de ce texte.

## Fonctionnement historique

Séquencer des messages utilisateur **distincts** dans **une seule conversation ChatGPT existante identifiée par son URL**, ou dans une nouvelle conversation demandée avec Chromium Kernel distant et un profil authentifié persistant. Aucun agent IA de navigateur, API de modèle, ordinateur ou téléphone local maintenu allumé.

## État vérifié — 28 octobre 2026

- **Connexion distante authentifiée : confirmée** : [test lecture seule](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40668999952).
- **Trois prompts consécutifs : confirmés 3/3** : [workflow live](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40673595092).
- **Prompts chiffrés, deux tours : confirmés 2/2** : [workflow chiffré](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40674400332).
- **Tests unitaires** : DOM sémantique, observateur de mutations, cryptographie authentifiée et anciens tests d'orchestration.
- **Plugin privé** : [Multi-Prompting Kernel 1.5.0](https://chatgpt.com/plugins/plugins_6ae1c9a72a94819181afc5a91d29e1f7).

Le moteur n'extrait jamais le texte des réponses. Une réponse est considérée terminée lorsque de nouveaux contrôles assistant (Copy, Rate response, Regenerate response) apparaissent, que la génération n'est plus active et que le DOM est stable.

## Architecture

1. **ChatGPT / plugin** : détermine une destination sûre (URL de conversation exacte pour le fil appelant) et chiffre les prompts et cette URL avec la clé publique du dépôt.
2. **GitHub** : reçoit uniquement un fichier de type requests/kernel-ID.sealed.json contenant le ciphertext ; le commit lance l'Action.
3. **GitHub Actions** : déchiffre en mémoire grâce au secret KERNEL_API_KEY et exécute src/kernel-sequence.mjs.
4. **Kernel** : crée Chromium en chargeant le profil persistant multi-prompting, puis Playwright se connecte via CDP et ouvre la conversation cible identifiée.
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

Une séquence conserve **un navigateur et une conversation uniques**. Le mode `caller` ou `existing` accepte soit l'URL canonique exacte `https://chatgpt.com/c/UUID`, soit `target_title` avec un titre exact et unique, placés dans l'enveloppe chiffrée ; le mode `new` reste disponible. Ses statuts sont completed, blocked ou ambiguous. Aucun renvoi automatique n'est autorisé si l'envoi peut avoir eu lieu.

Les anciens workflows run-sequence.yml et chain-sequence.yml concernent des **conversations simulées**, conservées pour la régression. Le moteur réel actuel est src/kernel-sequence.mjs.

## Limites

Le moteur ne vérifie ni la justesse ni le contenu textuel des réponses. La structure du site peut évoluer. **Mode conversation existante : la recherche native a été vérifiée en lecture seule sur Kernel, mais la sélection d'un résultat réel et l'envoi dans ce fil n'ont pas encore été validés de bout en bout.** Le plugin ne reçoit pas automatiquement l'identifiant de la conversation qui l'invoque : il doit résoudre son URL avec certitude (lien fourni ou onglet Browser identifiable), sinon ne lance rien. Aucune URL privée n'est journalisée.

Voir [docs/KERNEL_STATUS.md](docs/KERNEL_STATUS.md) pour les résultats exacts.

## Ciblage par titre exact (main, plugin 1.3.0)

Les modes `caller` et `existing` acceptent désormais **soit** `target_url` **soit** `target_title` dans la charge chiffrée ; les deux ensemble sont refusés. Par exemple : `{"mode":"live","target":"caller","target_title":"Titre exact transmis","prompts":["..."]}`. Le plugin doit récupérer le titre auprès de l'utilisateur ou d'un contexte d'onglet identifié de manière certaine ; le titre du fil appelant ne lui est **pas automatiquement transmis**. Ne jamais déduire ce titre à partir du sujet de la conversation.

Le navigateur authentifié effectue `Ctrl+K`, recherche ce titre, contrôle une correspondance textuelle et une destination canonique uniques, puis vérifie l'URL après ouverture. En cas de titres homonymes, absence de résultat ou changement du DOM : arrêt avant tout envoi. Le mode `new` et le ciblage par URL restent inchangés. Le traitement ne lit que les titres des résultats de recherche, jamais les réponses du fil.

Les historiques dont les compteurs utilisateur/assistant sont différents ne sont plus bloqués pour cette seule raison ; le contrôle porte également sur le dernier tour visible. Si les anciens tours sont virtualisés ou incomplets, le moteur reste volontairement prudent. Les tests avec navigateur simulé ne prouvent pas une exécution Kernel réelle sur un fil préexistant.

Test réel en lecture seule : [recherche native Kernel réussie, sans aucun message](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40682023141). Des tests précédents ont permis d'identifier le bouton `Search` et le champ `combobox` de l'interface actuelle.
