# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-23.11"; # or "unstable"

  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.nodejs_20
    pkgs.nodePackages.npm
  ];

  # Sets environment variables in the workspace
  env = {
    NODE_ENV = "development";
  };

  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      "dbaeumer.vscode-eslint"
      "esbenp.prettier-vscode"
      "bradlc.vscode-tailwindcss"
      "ms-vscode.vscode-typescript-next"
    ];

    # Workspace lifecycle hooks
    workspace = {
      # Runs when a workspace is first created
      onCreate = {
        install-frontend = "cd frontend && npm install";
        install-backend = "cd backend && npm install";
      };
      
      # Runs when the workspace is (re)started
      onStart = {
        start-frontend = "cd frontend && npm run dev -- --host 0.0.0.0 --port 5173 &";
      };
    };

    # Preview configuration
    previews = {
      enable = true;
      previews = {
        web = {
          command = ["npm" "run" "dev" "--" "--port" "$PORT" "--host" "0.0.0.0"];
          cwd = "frontend";
          manager = "web";
        };
      };
    };
  };
}
