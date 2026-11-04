# Run your website

The website is already implemented: storefront, search/categories, 100 additional demo listings, quotation requests, private owner dashboard, product/price editing, suppliers, and a persistent PostgreSQL database. You can run it on your own computer or chosen Linux server. AWS is not required for this local setup.

## One startup command

Install Node.js 24+, Docker Engine with Compose, and Git on your machine. Use this existing repository branch:

```sh
$ git clone --branch feat/aws-kubernetes-fullstack https://github.com/Vishnu063/Happy_Fatun.git
$ cd Happy_Fatun
$ bash scripts/start-website.sh
```

The script asks you to choose your owner password (14–256 characters; input hidden), creates a private configuration file, builds the existing app images, starts PostgreSQL and the website, and checks the catalog. You do not need to run npm install on the host for this shortcut; Docker installs locked dependencies during the build. First build may take a few minutes and needs adequate disk space.

Open **http://127.0.0.1:8081**. Your private dashboard is **http://127.0.0.1:8081/admin**. Log in with the password you entered. These addresses refer to the machine running the containers; they are not public website URLs.

If you already cloned the repository, keep that checkout and its existing work. Use the current tested commit; do not reset or overwrite local edits to run these commands.

## Your settings

- **Products, prices, category names, product images, contacts and supplier information:** edit in Master Control. No code change is required for these supported settings. Supplier costs and customer data remain private.
- **Port:** on first setup, `bash scripts/start-website.sh --port 18081` saves that port. Existing configuration is preserved; an explicit different port overrides only that invocation. Ports 8080 and 8090 are reserved. Leave other applications running.
- **Password and database/session credentials:** the script stores a salted password hash plus random database/session secrets in ignored `.env.lab`, mode 0600. It never saves the plaintext owner password and never overwrites an existing file. Keep the file private. Do not post credentials in chat or GitHub.
- **Database/media:** retained in this project's Docker volumes across stop/start. The PostgreSQL container is private and has no host port. Never delete volumes to troubleshoot customer data.

## Start again, check, or stop

```sh
$ bash scripts/start-website.sh --no-build
$ node scripts/website.mjs status
$ node scripts/website.mjs down
```

Use `--no-build` only after the three local app images have been built. It starts the saved setup without rebuilding. `status` shows container health. `down` stops only the website project and **keeps its database/media volumes**. Rebuild normally after updating source. Changing an already initialized database password requires an intentional DB password rotation; editing the env file alone is not a rotation procedure.

`bash scripts/start-website.sh --setup-only` creates private settings without building or starting any containers. Invalid/reserved ports or invalid passwords stop setup. Setup errors do not reset the database.

## What remains your deployment choice

This shortcut is a **local preview**, with loopback HTTP, noindex and disabled email. It does not configure your domain, public HTTPS, AWS, DNS, production credentials or backups. Saved quotations still work without email. For a public host, configure valid HTTPS, production-mode cookies and database TLS as required by the runtime, safe proxy/network rules, private secrets, backups/restoration and monitoring before publishing. See [the website guide](WEBSITE.md) and [readiness report](DEPLOYMENT_READINESS.md) for the tested components and external prerequisites. The unfinished AWS draft is separate and is not represented as deployed or verified by this shortcut.

Products are illustrative/demo listings until you provide real photos, prices, suppliers and availability. No verified stock counts, automatic SKU accounting, checkout, live email delivery or extra licensed 3D models are claimed. The existing Cloudflare path remains available separately.
