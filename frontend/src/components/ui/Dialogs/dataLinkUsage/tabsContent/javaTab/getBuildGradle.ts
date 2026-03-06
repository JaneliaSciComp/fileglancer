import type {
  DataLinkType,
  ZarrVersion
} from '@/components/ui/Dialogs/dataLinkUsage/DataLinkUsageDialog';

export default function getBuildGradle(
  dataType: DataLinkType,
  javaClassName: string,
  zarrVersion?: ZarrVersion
) {
  if (dataType === 'directory') {
    return `plugins {
    id 'java'
    id 'application'
}

repositories {
    mavenCentral()
    maven { url = 'https://maven.scijava.org/content/groups/public' }
}

application {
    mainClass = 'org.janelia.fileglancer.example.${javaClassName}'
}`;
  }

  // zarr v3 and ome-zarr v0.5 (zarr v3) use zarr-java; everything else uses n5-universe
  const useZarrJava =
    (dataType === 'zarr' || dataType === 'ome-zarr') && zarrVersion === 3;
  const dependency = useZarrJava
    ? "implementation 'dev.zarr:zarr-java:0.0.10'"
    : "implementation 'org.janelia.saalfeldlab:n5-universe:2.3.0'";

  if (useZarrJava) {
    return `plugins {
    id 'java'
    id 'application'
}

repositories {
    mavenCentral()
    maven { url = 'https://maven.scijava.org/content/groups/public' }
}

dependencies {
    ${dependency}
}

application {
    mainClass = 'org.janelia.fileglancer.example.${javaClassName}'
}`;
  }

  return `plugins {
    id 'java'
    id 'application'
}

repositories {
    mavenCentral()
    maven { url = 'https://maven.scijava.org/content/groups/public' }
}

dependencies {
    ${dependency}
}

configurations.all {
    // n5-universe pulls in jna 4.2.2 which lacks arm64 (Apple Silicon) support;
    // force a modern version so blosc-compressed arrays work on all platforms
    resolutionStrategy {
        force 'net.java.dev.jna:jna:5.14.0'
        force 'net.java.dev.jna:jna-platform:5.14.0'
    }
}

application {
    mainClass = 'org.janelia.fileglancer.example.${javaClassName}'
    applicationDefaultJvmArgs = [
        // Required for JNA to load native libraries in modern JVMs
        '--enable-native-access=ALL-UNNAMED',
        // Tell JNA where to find libblosc for blosc-compressed arrays:
        // /opt/homebrew/lib = Apple Silicon Mac, /usr/local/lib = Intel Mac
        '-Djna.library.path=/opt/homebrew/lib:/usr/local/lib'
    ]
}`;
}
