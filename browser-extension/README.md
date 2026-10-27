# Multi-Prompting Déterministe — extension navigateur

Cette extension MV3 exécute un enchaînement réel de **messages distincts dans l'onglet ChatGPT déjà ouvert et authentifié**. Elle n'utilise ni TinyFish, ni Replit Agent, ni clé de modèle, ni serveur externe. Elle ne copie pas le texte des réponses : elle surveille uniquement les états visibles de l'interface.

## Mise en place (ordinateur uniquement)

1. Télécharger le dépôt GitHub et extraire son archive ZIP.
2. Dans Chrome/Chromium sur ordinateur, ouvrir `chrome://extensions`.
3. Activer le **mode développeur**, puis **Charger l'extension non empaquetée** en sélectionnant le dossier `browser-extension`.
4. Ouvrir ChatGPT dans le navigateur et se connecter normalement.
5. Dans le panneau « Multi-Prompting déterministe », placer chaque prompt dans le champ, en séparant les prompts par une ligne `--- PROMPT ---`.
6. Cliquer sur **Démarrer**. Garder l'onglet et le navigateur ouverts pendant la séquence.

L'extension utilise des sélecteurs DOM de l'interface ChatGPT. Elle attend successivement un nouveau message utilisateur, un nouveau message assistant et des signaux de fin de génération stabilisés pendant 3,5 secondes. Elle ne réémet JAMAIS automatiquement un prompt en cas de doute ; elle arrête la séquence.

**Tests :** un test Playwright automatisé pilote une interface fictive compatible et valide trois tours différents ; consulter les exécutions GitHub Actions. Le fonctionnement sur le vrai site, dont l'interface change, doit être validé dans le navigateur de l'utilisateur ; ce test ne constitue pas une preuve de compatibilité permanente.

**Limitations :** cette extension ne fonctionne pas dans Chrome Android standard, ni dans l'application ChatGPT Android. Pour Android, le serveur MCP `native-mcp/` n'a pas de signal de fin de réponse et demande une interaction manuelle entre les tours. Aucun contournement de login, CAPTCHA, protection d'accès ou collecte de session n'est prévu.

**Confidentialité :** la séquence reste dans l'onglet utilisateur ; rien n'est transmis à un autre serveur par ce code. Le dépôt GitHub est public, donc ne jamais placer de prompts confidentiels dans les fichiers du dépôt.
