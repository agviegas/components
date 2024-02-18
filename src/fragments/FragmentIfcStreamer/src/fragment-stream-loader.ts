import * as THREE from "three";
import * as FRAG from "bim-fragment";
import { FragmentIdMap, FragmentsGroup } from "bim-fragment";
import { Component, Event } from "../../../base-types";
import { StreamedGeometries, StreamedAsset } from "./base-types";
import { Components, ToolComponent } from "../../../core";
import { GeometryCullerRenderer } from "./geometry-culler-renderer";
import { FragmentManager } from "../../FragmentManager";

interface StreamedInstance {
  id: number;
  color: number[];
  transformation: number[];
}

type StreamedInstances = Map<number, StreamedInstance[]>;

export interface StreamLoaderSettings {
  assets: StreamedAsset[];
  geometries: StreamedGeometries;
  globalDataFileId: string;
}

export class FragmentStreamLoader extends Component<any> {
  enabled = true;

  culler: GeometryCullerRenderer;

  readonly onFragmentsDeleted = new Event<FRAG.Fragment[]>();
  readonly onFragmentsLoaded = new Event<FRAG.Fragment[]>();

  models: {
    [modelID: string]: {
      assets: StreamedAsset[];
      geometries: StreamedGeometries;
    };
  } = {};

  serializer = new FRAG.StreamSerializer();

  url = "http://dev.api.thatopen.com/storage?fileId=";

  // private _hardlySeenGeometries: THREE.InstancedMesh;

  private _geometryInstances: {
    [modelID: string]: StreamedInstances;
  } = {};

  private _loadedFragments: {
    [modelID: string]: { [geometryID: number]: FRAG.Fragment[] };
  } = {};

  // FragID, [model, geometryID, hiddenItems]
  private fragIDData = new Map<
    string,
    [FRAG.FragmentsGroup, number, Set<number>]
  >();

  private _baseMaterial = new THREE.MeshLambertMaterial();
  private _baseMaterialT = new THREE.MeshLambertMaterial({
    transparent: true,
    opacity: 0.5,
  });

  constructor(components: Components) {
    super(components);
    this.components.tools.add(FragmentStreamLoader.uuid, this);

    // const hardlyGeometry = new THREE.BoxGeometry();
    // this._hardlySeenGeometries = new THREE.InstancedMesh();

    this.culler = new GeometryCullerRenderer(components);

    this.culler.onViewUpdated.add(
      async ({ toLoad, toRemove, toShow, toHide }) => {
        await this.loadFoundGeometries(toLoad);
        await this.unloadLostGeometries(toRemove);
        this.setMeshVisibility(toShow, true);
        this.setMeshVisibility(toHide, false);
      }
    );
  }

  static readonly uuid = "22437e8d-9dbc-4b99-a04f-d2da280d50c8" as const;

  async load(settings: StreamLoaderSettings, coordinate = true) {
    const { assets, geometries, globalDataFileId } = settings;

    const groupUrl = this.url + globalDataFileId;
    const groupData = await fetch(groupUrl);
    const groupArrayBuffer = await groupData.arrayBuffer();
    const groupBuffer = new Uint8Array(groupArrayBuffer);
    const fragments = this.components.tools.get(FragmentManager);
    const group = await fragments.load(groupBuffer, coordinate);

    const { opaque, transparent } = group.geometryIDs;
    for (const [geometryID, key] of opaque) {
      const fragID = group.keyFragments.get(key);
      if (fragID === undefined) {
        throw new Error("Malformed fragments group!");
      }
      this.fragIDData.set(fragID, [group, geometryID, new Set()]);
    }
    for (const [geometryID, key] of transparent) {
      const fragID = group.keyFragments.get(key);
      if (fragID === undefined) {
        throw new Error("Malformed fragments group!");
      }
      this.fragIDData.set(fragID, [group, Math.abs(geometryID), new Set()]);
    }

    this.culler.add(group.uuid, assets, geometries);
    this.models[group.uuid] = { assets, geometries };
    const instances: StreamedInstances = new Map();

    for (const asset of assets) {
      const id = asset.id;
      for (const { transformation, geometryID, color } of asset.geometries) {
        if (!instances.has(geometryID)) {
          instances.set(geometryID, []);
        }
        const current = instances.get(geometryID);
        if (!current) {
          throw new Error("Malformed instances");
        }
        current.push({ id, transformation, color });
      }
    }

    this._geometryInstances[group.uuid] = instances;

    this.culler.needsUpdate = true;
  }

  setVisibility(visible: boolean, filter: FragmentIdMap) {
    const modelGeomsAssets = new Map<string, Map<number, Set<number>>>();
    for (const fragID in filter) {
      const found = this.fragIDData.get(fragID);
      if (found === undefined) {
        throw new Error("Geometry not found!");
      }
      const [group, geometryID, hiddenItems] = found;
      const modelID = group.uuid;
      if (!modelGeomsAssets.has(modelID)) {
        modelGeomsAssets.set(modelID, new Map());
      }
      const geometriesAsset = modelGeomsAssets.get(modelID)!;
      const assets = filter[fragID];

      // Store the visible filter so that it's applied if this fragment
      // is loaded later
      for (const itemID of assets) {
        if (visible) {
          hiddenItems.delete(itemID);
        } else {
          hiddenItems.add(itemID);
        }
      }

      if (!geometriesAsset.get(geometryID)) {
        geometriesAsset.set(geometryID, new Set());
      }

      const assetGroup = geometriesAsset.get(geometryID)!;
      for (const asset of assets) {
        assetGroup.add(asset);
      }
    }
    for (const [modelID, geometriesAssets] of modelGeomsAssets) {
      // Set visibility of stream culler
      this.culler.setVisibility(visible, modelID, geometriesAssets);
      // set visibility of loaded fragments
      for (const [geometryID] of geometriesAssets) {
        const allFrags = this._loadedFragments[modelID];
        if (!allFrags) continue;
        const frags = allFrags[geometryID];
        if (!frags) continue;
        for (const frag of frags) {
          const ids = filter[frag.id];
          if (!ids) continue;
          frag.setVisibility(visible, ids);
        }
      }
    }

    this.culler.needsUpdate = true;
  }

  get() {}

  update() {}

  // getMesh(): THREE.Mesh {
  //   const box = this.culler.boxes.getMesh();
  //   if (box) {
  // this.components.scene.get().add(box);
  // const boundingBox = new THREE.Box3().setFromObject(box);
  // // @ts-ignore
  // const bHelper = new THREE.Box3Helper(boundingBox, 0xff0000);
  // this.components.scene.get().add(bHelper);
  // }
  // return box;
  // }
  // getSphere() {
  //   return this.culler.boxes.getSphere();
  // }

  private async loadFoundGeometries(seen: { [modelID: string]: Set<number> }) {
    for (const modelID in seen) {
      const fragments = this.components.tools.get(FragmentManager);
      const group = fragments.groups.find((group) => group.uuid === modelID);
      if (!group) {
        throw new Error("Fragment group not found!");
      }

      const ids = new Set(seen[modelID]);
      const { geometries } = this.models[modelID];

      const files = new Set<string>();

      for (const id of ids) {
        const geometry = geometries[id];
        if (!geometry) {
          throw new Error("Geometry not found");
        }
        if (geometry.geometryFile) {
          const file = geometry.geometryFile;
          files.add(file);
        }
      }

      for (const file of files) {
        const url = this.url + file;
        const fetched = await fetch(url);
        const buffer = await fetched.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const result = this.serializer.import(bytes);

        const loaded: FRAG.Fragment[] = [];

        if (result) {
          for (const [geometryID, { position, index, normal }] of result) {
            if (!ids.has(geometryID)) continue;

            if (
              !this._geometryInstances[modelID] ||
              !this._geometryInstances[modelID].has(geometryID)
            ) {
              continue;
            }

            const geoms = this._geometryInstances[modelID];
            const instances = geoms.get(geometryID);

            if (!instances) {
              throw new Error("Instances not found!");
            }

            const geom = new THREE.BufferGeometry();

            const posAttr = new THREE.BufferAttribute(position, 3);
            const norAttr = new THREE.BufferAttribute(normal, 3);
            const blockBuffer = new Uint8Array(position.length / 3);
            const blockID = new THREE.BufferAttribute(blockBuffer, 1);

            geom.setAttribute("position", posAttr);
            geom.setAttribute("normal", norAttr);
            geom.setAttribute("blockID", blockID);

            geom.setIndex(Array.from(index));

            // Separating opaque and transparent items is neccesary for Three.js

            const transp: StreamedInstance[] = [];
            const opaque: StreamedInstance[] = [];
            for (const instance of instances) {
              if (instance.color[3] === 1) {
                opaque.push(instance);
              } else {
                transp.push(instance);
              }
            }

            this.newFragment(group, geometryID, geom, transp, true, loaded);
            this.newFragment(group, geometryID, geom, opaque, false, loaded);
          }
        }

        if (loaded.length) {
          await this.onFragmentsLoaded.trigger(loaded);
        }
      }
    }
  }

  private async unloadLostGeometries(unseen: { [p: string]: Set<number> }) {
    const deletedFragments: FRAG.Fragment[] = [];
    const fragments = this.components.tools.get(FragmentManager);
    for (const modelID in unseen) {
      const group = fragments.groups.find((group) => group.uuid === modelID);
      if (!group) {
        throw new Error("Fragment group not found!");
      }

      if (!this._loadedFragments[modelID]) continue;
      const loadedFrags = this._loadedFragments[modelID];
      const geometries = unseen[modelID];

      for (const geometryID of geometries) {
        this.culler.removeFragment(group.uuid, geometryID);

        if (!loadedFrags[geometryID]) continue;
        const frags = loadedFrags[geometryID];
        for (const frag of frags) {
          group.items.splice(group.items.indexOf(frag), 1);
          deletedFragments.push(frag);
        }
        delete loadedFrags[geometryID];
      }
    }

    if (deletedFragments.length) {
      await this.onFragmentsDeleted.trigger(deletedFragments);
    }

    for (const frag of deletedFragments) {
      delete fragments.list[frag.id];
      this.components.meshes.delete(frag.mesh);
      frag.mesh.material = [] as THREE.Material[];
      frag.dispose(true);
    }
  }

  private setMeshVisibility(
    filter: { [modelID: string]: Set<number> },
    visible: boolean
  ) {
    for (const modelID in filter) {
      for (const geometryID of filter[modelID]) {
        const geometries = this._loadedFragments[modelID];
        if (!geometries) continue;
        const frags = geometries[geometryID];
        if (!frags) continue;
        for (const frag of frags) {
          frag.mesh.visible = visible;
        }
      }
    }
  }

  private newFragment(
    group: FragmentsGroup,
    geometryID: number,
    geometry: THREE.BufferGeometry,
    instances: StreamedInstance[],
    transparent: boolean,
    result: FRAG.Fragment[]
  ) {
    if (instances.length === 0) return;

    const uuids = group.geometryIDs;
    const uuidMap = transparent ? uuids.transparent : uuids.opaque;
    const factor = transparent ? -1 : 1;
    const tranpsGeomID = geometryID * factor;
    const key = uuidMap.get(tranpsGeomID);
    if (key === undefined) {
      throw new Error("Malformed fragment!");
    }
    const fragID = group.keyFragments.get(key);
    if (fragID === undefined) {
      throw new Error("Malformed fragment!");
    }

    const fragments = this.components.tools.get(FragmentManager);
    const fragmentAlreadyExists = fragments.list[fragID] !== undefined;
    if (fragmentAlreadyExists) {
      return;
    }

    const material = transparent ? this._baseMaterialT : this._baseMaterial;
    const fragment = new FRAG.Fragment(geometry, material, instances.length);

    fragment.id = fragID;
    fragment.mesh.uuid = fragID;

    group.add(fragment.mesh);
    group.items.push(fragment);

    fragments.list[fragment.id] = fragment;
    this.components.meshes.add(fragment.mesh);

    if (!this._loadedFragments[group.uuid]) {
      this._loadedFragments[group.uuid] = {};
    }
    const geoms = this._loadedFragments[group.uuid];
    if (!geoms[geometryID]) {
      geoms[geometryID] = [];
    }

    geoms[geometryID].push(fragment);

    const itemsMap = new Map<number, FRAG.Item>();
    for (let i = 0; i < instances.length; i++) {
      const transform = new THREE.Matrix4();
      const col = new THREE.Color();
      const { id, transformation, color } = instances[i];
      transform.fromArray(transformation);
      const [r, g, b] = color;
      col.setRGB(r, g, b, "srgb");
      if (itemsMap.has(id)) {
        const item = itemsMap.get(id)!;
        if (!item) continue;
        item.transforms.push(transform);
        if (item.colors) {
          item.colors.push(col);
        }
      } else {
        itemsMap.set(id, { id, colors: [col], transforms: [transform] });
      }
    }

    const items = Array.from(itemsMap.values());
    fragment.add(items);

    const data = this.fragIDData.get(fragment.id);
    if (!data) {
      throw new Error("Fragment data not found!");
    }

    const hiddenItems = data[2];
    if (hiddenItems.size) {
      fragment.setVisibility(false, hiddenItems);
    }

    this.culler.addFragment(group.uuid, geometryID, fragment);

    result.push(fragment);
  }
}

ToolComponent.libraryUUIDs.add(FragmentStreamLoader.uuid);