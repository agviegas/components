import * as THREE from "three";
import * as WEBIFC from "web-ifc";

export class Base {
    constructor(ifcAPI, model) {
        this.ifcAPI = ifcAPI;
        this.model = model;

        this.types = {
            REAL: (value) => this.real(value),
            LENGTH: (value) => this.length(value),
            POSITIVE_LENGTH: (value) => this.positiveLength(value)
        }
    }

    guid(value) {
        return this.ifcAPI.CreateIfcType(this.model, WEBIFC.IFCGLOBALLYUNIQUEID, value);
    }

    identifier(value) {
        return this.ifcAPI.CreateIfcType(this.model, WEBIFC.IFCIDENTIFIER, value);
    }

    real(value) {
        return this.ifcAPI.CreateIfcType(this.model, WEBIFC.IFCREAL, value)
    }

    label(text) {
        return this.ifcAPI.CreateIfcType(this.model, WEBIFC.IFCLABEL, text);
    }

    identifier(value) {
        return this.ifcAPI.CreateIfcType(this.model, WEBIFC.IFCIDENTIFIER, value)
    }

    length(value) {
        return this.ifcAPI.CreateIfcType(this.model, WEBIFC.IFCLENGTHMEASURE, value);
    }

    positiveLength(value) {
        return this.ifcAPI.CreateIfcType(this.model, WEBIFC.IFCPOSITIVELENGTHMEASURE, value);
    }

    direction(values) {
        return this.ifcAPI.CreateIfcEntity(this.model, WEBIFC.IFCDIRECTION, this.vector(values, "REAL"));
    }

    point(values) {
        return this.ifcAPI.CreateIfcEntity(this.model, WEBIFC.IFCCARTESIANPOINT, this.vector(values, "LENGTH"));
    }

    axis2Placement2D(location, direction = null) {
        const loc = this.point(location);
        let dir = direction;
        if (direction) {
            dir = this.direction(direction);
        }
        return this.ifcAPI.CreateIfcEntity(this.model, WEBIFC.IFCAXIS2PLACEMENT2D, loc, dir);
    }

    axis2Placement3D(location, axis = null, direction = null) {
        const point = this.point(location);
        let ax = axis;
        if (axis) {
            ax = this.direction(axis);
        }
        let dir = direction;
        if (direction) {
            dir = this.direction(direction);
        }
        const placement = this.ifcAPI.CreateIfcEntity(this.model, WEBIFC.IFCAXIS2PLACEMENT3D, point, ax, dir);
        return {placement, point};
    }

    extrudedAreaSolid(profile, placement, direction, length) {
        const len = this.positiveLength(length);
        return this.ifcAPI.CreateIfcEntity(this.model, WEBIFC.IFCEXTRUDEDAREASOLID, profile, placement, direction, len);
    }

    circularProfile(axis, radius) {
        return this.ifcAPI.CreateIfcEntity(this.model, WEBIFC.IFCCIRCLEPROFILEDEF, WEBIFC.IFC4.IfcProfileTypeEnum.AREA, this.label('asdf'), axis, radius);
    }

    rectangularProfile(axis, x, y) {
        return this.ifcAPI.CreateIfcEntity(this.model, WEBIFC.IFCRECTANGLEPROFILEDEF, WEBIFC.IFC4.IfcProfileTypeEnum.AREA, this.label('asdf'), axis, x, y);
    }

    bool(first, second) {
        return this.ifcAPI.CreateIfcEntity(this.model,
            WEBIFC.IFCBOOLEANCLIPPINGRESULT,
            WEBIFC.IFC4.IfcBooleanOperator.DIFFERENCE,
            first,
            second);
    }



    column(guid, placement, mesh) {
        return this.ifcAPI.CreateIfcEntity(this.model,
            WEBIFC.IFCCOLUMN,
            this.guid(guid),
            null,
            this.label("name"),
            null,
            this.label("label"),
            placement,
            mesh,
            this.identifier("sadf"),
            null)
    }

    simpleWall(guid, placement, mesh) {
        return this.ifcAPI.CreateIfcEntity(this.model,
            WEBIFC.IFCWALLSTANDARDCASE,
            this.guid(guid),
            null,
            this.label("name"),
            null,
            this.label("label"),
            placement,
            mesh,
            this.identifier("sadf"),
            null)
    }

    opening(guid, placement, mesh) {
        return this.ifcAPI.CreateIfcEntity(this.model,
            WEBIFC.IFCOPENINGELEMENT,
            this.guid(guid),
            null,
            this.label("name"),
            null,
            this.label("label"),
            placement,
            mesh,
            this.identifier("sadf"),
            null)
    }

    vector(values, type) {
        if (!this.types[type]) {
            throw new Error(`Type not found: ${type}`);
        }
        const action = this.types[type];
        const result = [];
        for (const value of values) {
            result.push(action(value));
        }
        return result;
    }

    relVoids(guid, voided, voider) {
        return this.ifcAPI.CreateIfcEntity(this.model,
            WEBIFC.IFCRELVOIDSELEMENT,
            this.guid(guid),
            null,
            null,
            null,
            voided,
            voider)
    }

    geometry(data) {
        const index = this.ifcAPI.GetIndexArray(
            data.GetIndexData(),
            data.GetIndexDataSize()
        );

        const vertexData = this.ifcAPI.GetVertexArray(
            data.GetVertexData(),
            data.GetVertexDataSize()
        );

        const position = new Float32Array(vertexData.length / 2);
        const normal = new Float32Array(vertexData.length / 2);

        for (let i = 0; i < vertexData.length; i += 6) {
            position[i / 2] = vertexData[i];
            position[i / 2 + 1] = vertexData[i + 1];
            position[i / 2 + 2] = vertexData[i + 2];

            normal[i / 2] = vertexData[i + 3];
            normal[i / 2 + 1] = vertexData[i + 4];
            normal[i / 2 + 2] = vertexData[i + 5];
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
        geometry.setIndex(Array.from(index));

        return geometry;
    }
}