const execa = require('execa')
const fs = require('fs')
const path = require('path')
const tar = require('tar')
const S3Client = require('esdk-obs-nodejs')

const S3_FOLDER = 'npm'
const S3_BUCKET = process.env.S3_BUCKET
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY
const S3_SECRET_KEY = process.env.S3_SECRET_KEY
const S3_ENDPOINT = process.env.S3_ENDPOINT
const ROOT_DIR = path.join(__dirname, '..')

async function uploadFileToOBS({
    client,
    filePath,
    objectKey
}) {
    return new Promise((resolve, reject) => {
        client.putObject({
            Bucket: S3_BUCKET,
            Key: objectKey,
            SourceFile: filePath
        }, (err, result) => {
            if (err) {
                console.error(`Failed to upload ${objectKey}:`, err);
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function getAllFiles(dirPath, baseDir = dirPath) {
    let results = [];
    const list = fs.readdirSync(dirPath);

    list.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);

        if (stat && stat.isDirectory()) {
            // Recursively walk through folders
            results = results.concat(getAllFiles(fullPath, baseDir));
        } else {
            // Calculate relative path and format it for OBS/S3 (forward slashes)
            const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
            results.push({
                fullPath,
                relativePath
            });
        }
    });

    return results;
}


async function uploadNPMPackage() {
    if (!S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_ENDPOINT) {
        throw new Error('Missing required environment variables')
    }

    const s3Client = new S3Client({
        server: S3_ENDPOINT,
        access_key_id: S3_ACCESS_KEY,
        secret_access_key: S3_SECRET_KEY,
    })

    // STEP 0: Prepare build dir and extract package info
    const buildDir = path.join(ROOT_DIR, 'build')
    if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true })
    }

    const packageInfo = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'))
    const packageName = packageInfo.name
    const packageVersion = packageInfo.version
    const artifactFolder = `${packageName}-${packageVersion}`.replaceAll(/[^a-z.0-9-]/ig, '-').replace(/^-/, '')
    const artifactName = `${artifactFolder}.tgz`
    const artifactPath = path.join(buildDir, artifactName)
    const artifactFolderPath = path.join(buildDir, artifactFolder)
    const s3SourcePath = path.join(artifactFolderPath, 'package')

    if (fs.existsSync(artifactFolderPath)) {
        fs.rmSync(artifactFolderPath, { recursive: true })
    }
    fs.mkdirSync(artifactFolderPath, { recursive: true })
    if (fs.existsSync(artifactPath)) {
        fs.rmSync(artifactPath)
    }


    // STEP 1: Build the package
    await execa('npm', ['pack', '--pack-destination=build'])

    // STEP 2: Unzip the package
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Failed to build package: ${artifactPath} does not exist`)
    }

    await tar.x({
        file: artifactPath,
        cwd: artifactFolderPath
    })

    if (!fs.existsSync(s3SourcePath)) {
        throw new Error(`Failed to unzip package: ${s3SourcePath} does not exist`)
    }

    const tags = [
        // 1.2.3-dev
        packageVersion,
        // v1
        `v${parseInt(packageVersion.split('.')[0])}`,
        // latest
        'latest'
    ]

    // STEP 3: Upload artifacts
    for (const tag of tags) {
        for (const { fullPath, relativePath } of getAllFiles(s3SourcePath)) {
            const relativeKey = relativePath.replace(/\\/g, '/')
            const s3ObjectKey = [S3_FOLDER, packageName, tag, relativeKey].join('/')
            await uploadFileToOBS({
                client: s3Client,
                filePath: fullPath,
                objectKey: s3ObjectKey
            })
        }
    }
}

uploadNPMPackage().then(() => {
    console.log('Package built successfully')
    process.exit(0)
}).catch(err => {
    console.error(err)
    process.exit(1)
})