const inquire = require('inquirer');
const fetch = require('node-fetch');
const open = require('opn');

const GH_TOKEN = process.env.GH_TOKEN;

const tokenURL = 'https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line';
const tokenHelp = `
  Create a token:
  ${tokenURL}
`;

const main = async () => {
  if (!GH_TOKEN) {
    console.error(`
GH_TOKEN is unspecified in current environment.`);
    console.info(tokenHelp);
    await inquire.prompt([{
      type: 'confirm',
      name: 'open',
      message: 'Would you like to open the link in your browser?',
      default: false
    }]).then(response => {
      if (response.open) {
        open(tokenURL);
      }
    }).finally(() => {
      process.exit(0);
    });
  }

  const { from, to, cleanup } = await inquire.prompt([{
    type: 'input',
    name: 'from',
    message: 'What is the current default branch name?',
    default: 'master'
  }, {
    type: 'input',
    name: 'to',
    message: 'What is the desired default branch name?',
    default: 'main'
  }, {
    type: 'confirm',
    name: 'cleanup',
    message: 'Would you like to delete the original default branch after update?',
    default: false
  }]).catch(fatal);

  try {
    let { owner, repositories } = await fetchOwnerAndRepositories(to);
    repositories = repositories.filter(r => r.defaultBranchRef);
    const count = repositories.length;
    console.info(`${count} repositor${count === 1 ? 'y' : 'ies'} found.`);
    await Promise.all(repositories.map(async repository => {
      if (repository.defaultBranchRef.name === to) {
        console.info(`Default branch already up to date for ${repository.name}.`);
        return;
      }
      try {
        let refs = repository.refs.edges.map(e => e.node);
        if (!refs.find(ref => ref.name === to)) {
          const oid = repository.defaultBranchRef.target.oid;
          await createBranch(repository.id, oid, to);
          console.info(`New branch created for ${repository.name}.`);
        } else {
          console.info(`Branch already exists for ${repository.name}.`);
        }
        await updateDefaultBranch(owner, repository.name, to);
        console.info(`Updated default branch for ${repository.name}.`);
        if (cleanup) {
          await deleteBranch(repository.defaultBranchRef.id);
          console.info(`Deleted original default branch for ${repository.name}.`);
        }
      } catch (error) {
        console.error(`An error occurred while processing repository: ${repository.name}.`);
        console.error(error);
      }
    }));
  } catch (error) {
    fatal(error);
  }
};

const fatal = error => console.error(error) && process.exit(1);

/**
 * POST to API v4 (GraphQL)
 */
const post = async (data) => {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'post',
    body: JSON.stringify(data),
    headers: {
      'Authorization': `token ${GH_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return await response.json();
};

const fetchOwnerAndRepositories = async (branch, after) => {
  const query = `
  query ($branch: String!, $after: String) {
    viewer {
      login
      repositories(first: 100, after: $after, ownerAffiliations: OWNER) {
        edges {
          node {
            id
            name
            defaultBranchRef {
              id
              name
              target {
                oid
              }
            }
            refs(query: $branch, first: 100, refPrefix: "refs/heads/") {
              edges {
                node {
                  name
                  target {
                    oid
                  }
                }
              }
            }
          }
        }
        totalCount
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
`;
  let response = await post({ query, variables: { branch, after }});
  let data = response.data.viewer.repositories;
  let repositories = data.edges.map(e => e.node);
  if (data.pageInfo.hasNextPage) {
    let next = await fetchOwnerAndRepositories(data.pageInfo.endCursor);
    repositories = repositories.concat(next.repositories);
  }
  return { owner: response.data.viewer.login, repositories };
};

const createBranch = async (repositoryId, oid, branch) => {
  let name = `refs/heads/${branch}`;
  const query = `
    mutation ($repositoryId: ID!, $name: String!, $oid: GitObjectID!) {
      createRef(input: {repositoryId: $repositoryId, name: $name, oid: $oid}) {
        ref {
          id
        }
      }
    }
`;
  return await post({ query, variables: { repositoryId, name, oid }});
};

/**
 * API v4 does not appear to enable updates to the default branch for a repository.
 * Falling back to v3.
 */
const updateDefaultBranch = async (owner, repo, default_branch) => {
  let response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    method: 'patch',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `token ${GH_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({ default_branch })
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }
};

const deleteBranch = async (id) => {
  const query = `
    mutation($id:ID!) {
      deleteRef(input:{ refId: $id }){
        clientMutationId
      }
    }
`;
  return await post({ query, variables: { id }});
};

main();