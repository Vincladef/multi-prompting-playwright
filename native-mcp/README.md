# Multi-Prompting MCP natif

Ce composant utilise l'API officielle `ui/message` / `window.openai.sendFollowUpMessage` pour envoyer de **vrais tours utilisateur dans la conversation ChatGPT actuelle**, sans navigateur Playwright, TinyFish ou API de modèle supplémentaire.

**Limitation connue :** OpenAI n'expose pas d'événement fiable de fin de réponse à une application embarquée (retour du support du 8 septembre 2026). Le composant impose donc **une action de l'utilisateur entre deux tours**, pour garantir que le prompt suivant ne parte pas pendant la génération. Il ne prétend pas enchaîner les prompts en autonomie.

## Architecture

- Serveur MCP Streamable HTTP stateless, `POST /mcp`, `GET /health`.
- Ressource `ui://multi-prompting/sequence.html`, avec un bouton pour envoyer un prompt à la fois.
- Tool `open_sequence({ prompts: string[] })`.
- Le serveur ne reçoit ni cookies ni réponses de l'utilisateur.
- Le composant conserve la progression dans l'état ChatGPT du widget quand ce service est disponible.
- Serveur sans frais API ; peut fonctionner sur Render free, car chaque requête est courte, mais il peut se mettre en veille.

## Installer

Créer un service Docker sur Render avec le dépôt `Vincladef/multi-prompting-playwright` :
- Dockerfile : `native-mcp/Dockerfile`
- Build context : racine du dépôt
- Plan : free
- Port : 3000

Puis dans ChatGPT, ajouter comme serveur MCP personnalisé `https://<adresse>.onrender.com/mcp`.

Ne pas entrer de secrets dans le dépôt GitHub. Les utilisateurs d'Android peuvent tester `ui/message` en chat ; la destination « nouveau chat » n'est pas garantie sur tous les hôtes.

## Tests

Vérifier `GET /health`, puis `tools/list`, `resources/read` et lancer `open_sequence` dans ChatGPT. Tester d'abord deux prompts courts, en cliquant sur le bouton entre les réponses.
