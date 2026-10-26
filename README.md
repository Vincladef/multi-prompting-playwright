# Multi-Prompting Playwright

Moteur séquentiel déterministe pour automatiser des échanges dans **un environnement autorisé**. Le mode `demo` ouvre une fausse interface de conversation locale : il permet de vérifier réellement Chromium, Playwright et l'ordre d'envoi sans solliciter ChatGPT.

## Fonctionnement

- Un service HTTP protège les routes de commandes avec `SERVICE_TOKEN`.
- `POST /jobs` reçoit un tableau de prompts, puis les traite strictement dans l'ordre.
- `GET /jobs/:id` expose état, progression, erreurs et URL, **jamais le texte des réponses**.
- `POST /jobs/:id/cancel` stoppe les étapes restantes.
- Un seul navigateur actif ; aucun renvoi automatique d'un prompt après échec ambigu.
- Modes : `demo` validable localement ; `chatgpt` désactivé par défaut et non validé en production.

## Développement

Node.js 22+ requis.

    npm install
    npx playwright install chromium
    npm test
    SERVICE_TOKEN=une-longue-cle-secrete npm start

Test du moteur (sur une page locale fictive) :

    curl -X POST http://localhost:3000/jobs -H 'Authorization: Bearer une-longue-cle-secrete' -H 'Content-Type: application/json' -d '{"prompts":["ALPHA","BRAVO","CHARLIE"],"mode":"demo"}'

La réponse contient un identifiant ; interroger `GET /jobs/<id>`.

## Hébergement Render

Le `Dockerfile` fournit Chromium avec les bibliothèques nécessaires. Créer un **Web Service Docker** avec `SERVICE_TOKEN` défini dans les variables secrètes Render. Le mode démonstration n'exige aucune connexion à ChatGPT.

Le mode `chatgpt` nécessite `ALLOW_LIVE_CHATGPT=true` et un profil Chromium préalablement authentifié (`PROFILE_DIR`). Ce mode est **expérimental et désactivé par défaut**. Ne jamais inscrire de cookie, jeton ou mot de passe dans GitHub. Ne pas contourner de CAPTCHA, de protection de connexion ou de quota. L'analyse des états d'interface n'est pas une preuve formelle de fin de génération ; en cas d'incertitude, interrompre.

**Conformité :** les conditions OpenAI interdisent l'extraction automatique ou programmée des sorties. Ce projet ne collecte ni ne transmet le texte des réponses. Vérifier la conformité et les autorisations applicables avant tout usage sur ChatGPT.

**Important :** les jobs sont gardés en mémoire pour ce prototype ; les redémarrages Render les effacent. La file persistante Neon viendra après les tests. Les instances Render gratuites n'ont pas de disque persistant et peuvent s'endormir ; elles ne conviennent pas à une session ChatGPT permanente.

## Endpoints

- `GET /health` : statut de service, public.
- `POST /jobs` : `{"prompts":["..."],"mode":"demo"}`, autorisé.
- `GET /jobs/:id` : lecture d'état, autorisée.
- `POST /jobs/:id/cancel` : demande d'annulation, autorisée.

Le service ne lance aucune automatisation de ChatGPT à sa création.
