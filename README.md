# GitHub: Rename Default Branch

["Rename" the default branch](https://help.github.com/en/github/administering-a-repository/setting-the-default-branch) for all of your personal github repositories.

## Usage

You'll need an OAuth token with the right scopes to utilize this utility. See "[Creating a personal access token for the command line](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line)" for detailed instructions and ensure the `repo` scope is granted.

```sh
GH_TOKEN=... npx github-rename-default-branch
```

The interactive prompt will ask you to specify the original default branch name, the desired default branch name and whether or not you would like the original default branch deleted after updates.