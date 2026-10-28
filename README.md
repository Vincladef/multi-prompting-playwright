# Multi-Prompting : moteur Playwright sur GitHub Actions

Prototype déterministe et **gratuit dans un dépôt public**, sans Render, Oracle, Netlify, TinyFish ou clé d'API de modèle.

> **État réel :** le workflow pilote actuellement une page de conversation **simulée**. Il ne poste pas encore de messages dans ton compte ChatGPT. Les validations portant sur la session authentifiée, le respect des conditions d'utilisation et la fiabilité de la fin de génération restent à faire.

## Déclenchement autonome depuis ChatGPT

Le connecteur GitHub peut créer un fichier dans `requests/` (un commit d'ajout par demande). Cela déclenche automatiquement [le workflow](https://github.com/Vincladef/multi-prompting-playwright/actions/workflows/run-sequence.yml) ; aucun clic GitHub n'est nécessaire.

Exemple de demande dans ce dépôt public, **réservée aux contenus non confidentiels** :

```json
{
  "mode": "demo",
  "prompts": ["Réponds ALPHA", "Réponds BRAVO", "Résume les deux étapes précédentes"]
}
```

Nom autorisé : `requests/nom-unique.json`. Le workflow détecte automatiquement le fichier ajouté. Chaque exécution utilise une VM Ubuntu propre et une nouvelle instance Chromium.

**Confidentialité :** les prompts placés dans le dépôt public sont publiquement consultables. Ne jamais y déposer d'informations personnelles, de mots de passe ni de cookies. Ne pas utiliser de pull requests externes pour exécuter des commandes avec des secrets.

## Déclenchement manuel

Ouvrir [GitHub Actions → Multi-Prompting → Run workflow](https://github.com/Vincladef/multi-prompting-playwright/actions/workflows/run-sequence.yml), puis entrer un tableau JSON de prompts :

```json
["ALPHA", "BRAVO", "CHARLIE"]
```

Cliquer sur `Run workflow`. Le rapport `multi-prompting-report` est disponible dans les artefacts de l'exécution, sous `artifacts/run-report.json`, pendant 7 jours.

**Limites :** entre 1 et 20 prompts, 10 000 caractères chacun au maximum ; mode `demo` seulement.

## Vérifications effectuées par Playwright

1. Ouvrir Chromium et une interface simulée.
2. Envoyer chaque prompt en tant que message utilisateur distinct.
3. Attendre la réponse simulée, vérifier la fin de génération.
4. En cas de doute ou d'échec, bloquer sans réessayer ni dupliquer.
5. Après N messages, vérifier l'ordre exact des N prompts et N réponses.
6. Écrire un rapport JSON avec le nombre d'étapes confirmées.

Le workflow de tests unitaires et navigateur se trouve dans `.github/workflows/test.yml`.

## Développement local

Nécessite Node.js 22+ :

```bash
npm install
npx playwright install chromium
npm test
INPUT_PROMPTS_JSON='["ALPHA","BRAVO","CHARLIE"]' node src/run-once.mjs
```

Le service HTTP de prototype `src/server.mjs` et le `Dockerfile` sont laissés dans le dépôt pour des expérimentations locales, mais ne sont **pas utilisés** par GitHub Actions.

## Ce qui manque pour exécuter de vrais prompts ChatGPT

Le runner GitHub Actions est **éphémère**. Il ne possède ni session ChatGPT authentifiée ni profil Chromium persistant. Les cookies et clés privées ne doivent jamais être enregistrés dans le dépôt. Le site peut exiger une authentification interactive et son interface ne fournit aucune garantie immuable concernant la fin des réponses.

La voie officiellement prise en charge pour une exécution multi-tours automatisée est l'API de modèle, qui requiert des identifiants et implique une tarification distincte. Les règles applicables à l'automatisation du site ChatGPT doivent être respectées. Ne pas contourner les protections, les CAPTCHA ou les quotas.

## Tests réels du 27 octobre 2026

- Démonstration de **7 prompts et 7 réponses** : réussite sur interface locale simulée, [exécution GitHub](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40428076561).
- Première sonde sur le site réel `chatgpt.com`, sans compte : **0/3** messages, composeur absent, [exécution GitHub](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40429279803).
- Seconde sonde, après attente allongée : **0/3** ; la page renvoie le titre **« Just a moment... »**, sans champ de saisie. Cela indique une protection ou vérification d'accès que le moteur ne doit pas contourner, [exécution GitHub](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40429908722).

**La limite actuelle est le vrai site ChatGPT, pas la durée de GitHub Actions.** Le workflow séquentiel admet désormais 180 minutes par job et le moteur permet jusqu'à 45 minutes par réponse par défaut. Une session ChatGPT authentifiée n'est pas disponible dans les runners GitHub éphémères ; aucune donnée d'authentification n'est stockée.

## Chaînage automatique entre plusieurs jobs (28 octobre 2026)

Le moteur de reprise se trouve dans `src/chain-state.mjs` et `src/chain-run.mjs`. Le nouveau [workflow de relais](https://github.com/Vincladef/multi-prompting-playwright/actions/workflows/chain-sequence.yml) démarre lorsqu'un fichier `requests/chain-*.json` est ajouté sur `main`. Il peut déclencher le job suivant via `workflow_dispatch` avec le `GITHUB_TOKEN` intégré et `actions: write`, sans jeton personnel ni agent IA.

Le checkpoint contient un identifiant de séquence, la liste des **prompts de démonstration**, l'index `next`, le numéro `hop`, la liste des étapes confirmées et les plafonds `batchSize` et `maxHops`. Le résultat de chaque job est archivé en JSON. Les relais et les erreurs sont bloquants : pas de réémission automatique d'un envoi ambigu.

**Preuve de bout en bout, trois jobs distincts réussis :**
- [Job 1, étape 1/3](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40638666466) : `handoff_dispatched` ;
- [Job 2, étape 2/3](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40638722926) : `handoff_dispatched` ;
- [Job 3, étape 3/3](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40638795085) : `completed`.

Il s'agit d'une **preuve du chaînage GitHub Actions**, avec une fixture de conversation locale et simulée. Chaque nouveau job recrée Chromium ; **aucune session ChatGPT réelle n'est transmise**. Un [nouveau contrôle du vrai site le 28 octobre](https://github.com/Vincladef/multi-prompting-playwright/actions/runs/40638720473) s'est de nouveau arrêté à `blocked`, **0/3** messages, en mode invité.

**Sécurité et confidentialité :** le dépôt est public et l'état encodé dans `workflow_dispatch` n'est **pas chiffré** : uniquement des prompts de démonstration non confidentiels. Le service Neon n'est pas encore relié à ce workflow ; le checkpoint du prototype transite par les entrées de workflow et ses artefacts. Pour exploiter des prompts privés, il faudra un stockage privé et des secrets configurés sur le runner. Le serveur MCP connecté sur Render n'accorde pas d'accès de navigateur authentifié à GitHub.

La limite du job reste de 180 minutes, avec un maximum GitHub de 6 heures sur runners hébergés ; la progression est reprise au job suivant, sans prolonger l'ancien processus ni conserver sa mémoire navigateur.
