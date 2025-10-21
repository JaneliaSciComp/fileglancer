# Making a new release of Fileglancer

## Bump the version number

To view the current version:
```bash
pixi run version
```

To bump the minor version:
```bash
pixi run version minor
```

You can also specify "major", "patch", or a specific version like "2.1.0". See the docs on [hatch-nodejs-version](https://hatch.pypa.io/1.9/version/#supported-segments) for more details.

## Clean build

Make sure to do a clean build before building the package for release:

```bash
./clean.sh
pixi run dev-install
```

The `version` command updated the `package.json` and the clean build updated the `package-lock.json` file. Make sure to check these changes into the main branch.


## Package

Build the distribution bundle:

```bash
pixi run pypi-build
```

To upload the package to the PyPI, you'll need one of the project owners to add you as a collaborator. After setting up your access token, do:

```bash
pixi run pypi-upload
```

The new version should now be [available on PyPI](https://pypi.org/project/fileglancer/).

Now [draft a new release](https://github.com/JaneliaSciComp/fileglancer/releases/new). Create a new tag that is the same as the version number, and set the release title to the same (e.g. "1.0.0". Click on "Generate release notes" and make any necessary edits. Ideally, you should include any release notes from the associated [fileglancer-central](https://github.com/JaneliaSciComp/fileglancer-central) release.

## Other documentation

- [Development](Development.md)
